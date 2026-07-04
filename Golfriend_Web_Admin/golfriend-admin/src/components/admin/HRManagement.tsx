import { useState, useEffect } from 'react';
import { db } from '../../firebaseConfig';
import { collection, onSnapshot, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

export default function HRManagement() {
  const [staff, setStaff] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ email: string, tempPass: string } | null>(null);

  // New Employee Form State
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("Support");

  // 1. LIVE LEDGER: Fetch all Admin Users (Excluding B2B Partners)
  useEffect(() => {
    // Note: You may need to adjust this query based on how you separate B2B partners from your own staff.
    // Assuming internal staff have roles like 'Director', 'Manager', 'Support'.
    const q = query(collection(db, 'admin_users'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // 🔥 Added 'as any' to satisfy strict typing on Firestore docs
      const allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      setStaff(allUsers.filter((u: any) => u.role !== 'Partner')); 
    });
    return () => unsubscribe();
  }, []);

  // 2. ACTION: HIRE NEW EMPLOYEE
  const handleInvite = async () => {
    if (!newEmail || !newName) return alert("Please fill out the email and name.");
    setIsProcessing(true);
    setInviteResult(null);

    try {
      const functions = getFunctions();
      const inviteEmployee = httpsCallable(functions, 'inviteEmployee');
      
      const response: any = await inviteEmployee({
        email: newEmail,
        displayName: newName,
        role: newRole
      });

      if (response.data.success) {
        setInviteResult({ email: newEmail, tempPass: response.data.tempPassword });
        setNewEmail(""); setNewName(""); setNewRole("Support");
      }
    } catch (error: any) {
      alert("Failed to invite employee: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. ACTION: TERMINATE / SUSPEND ACCESS
  const handleRevoke = async (uid: string, currentStatus: string) => {
    const newStatus = currentStatus === 'Suspended' ? 'Active' : 'Suspended';
    const confirmMsg = newStatus === 'Suspended' 
      ? "Suspend this employee? They will immediately lose dashboard access."
      : "Restore this employee's access?";
      
    if (window.confirm(confirmMsg)) {
      await updateDoc(doc(db, 'admin_users', uid), { status: newStatus });
    }
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#121212', minHeight: '100vh', color: '#fff', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#D4AF37', margin: '0 0 8px 0', borderBottom: '1px solid #333', paddingBottom: '12px' }}>
        👔 HR & TEAM MANAGEMENT
      </h2>
      <p style={{ color: '#aaa', fontSize: '14px', marginBottom: '30px' }}>
        Invite staff, assign roles, and manage dashboard access levels.
      </p>

      <div style={{ display: 'flex', gap: '40px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        
        {/* LEFT COLUMN: THE HIRE FORM */}
        <div style={{ flex: '1 1 400px', maxWidth: '500px', backgroundColor: '#1e1e1e', padding: '24px', borderRadius: '8px', border: '1px solid #333' }}>
          <h3 style={{ color: '#D4AF37', marginTop: 0, marginBottom: '20px' }}>Hire New Employee</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <input 
              type="text" placeholder="Full Name" value={newName} onChange={(e) => setNewName(e.target.value)} 
              style={{ padding: '12px', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#111', color: '#fff' }} 
            />
            <input 
              type="email" placeholder="Corporate Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} 
              style={{ padding: '12px', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#111', color: '#fff' }} 
            />
            <select 
              value={newRole} onChange={(e) => setNewRole(e.target.value)} 
              style={{ padding: '12px', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#111', color: '#fff' }}
            >
              <option value="Manager">Manager (Operations & Disputes)</option>
              <option value="Support">Support (Photo Validation Only)</option>
              {/* Note: Never allow hiring a new 'Director' from the UI for security */}
            </select>

            <button 
              onClick={handleInvite} disabled={isProcessing} 
              style={{ padding: '16px', backgroundColor: '#D4AF37', color: '#000', fontWeight: '900', border: 'none', borderRadius: '4px', marginTop: '10px', cursor: 'pointer' }}
            >
              {isProcessing ? 'GENERATING CREDENTIALS...' : 'CREATE ACCOUNT & HIRE ➔'}
            </button>
          </div>

          {/* SECURE CREDENTIAL HANDOFF ALERT */}
          {inviteResult && (
            <div style={{ marginTop: '20px', padding: '15px', backgroundColor: 'rgba(76, 175, 80, 0.1)', border: '1px solid #4CAF50', borderRadius: '8px' }}>
              <h4 style={{ color: '#4CAF50', margin: '0 0 10px 0' }}>✅ Account Created Successfully</h4>
              <p style={{ margin: '0 0 5px 0', fontSize: '13px' }}>Provide these credentials to your new employee. They will be forced to change this password on first login.</p>
              <div style={{ backgroundColor: '#000', padding: '10px', borderRadius: '4px', fontFamily: 'monospace', color: '#D4AF37', marginTop: '10px' }}>
                <div>Email: {inviteResult.email}</div>
                <div>Temp Pass: {inviteResult.tempPass}</div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: ACTIVE ROSTER */}
        <div style={{ flex: '2 1 600px', backgroundColor: '#1e1e1e', padding: '24px', borderRadius: '8px', border: '1px solid #333' }}>
          <h3 style={{ color: '#D4AF37', marginTop: 0, marginBottom: '20px' }}>Official Staff Roster</h3>
          
          <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', fontSize: '14px', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #444', color: '#888' }}>
                <th style={{ padding: '12px 0' }}>Name</th>
                <th style={{ padding: '12px 0' }}>Role</th>
                <th style={{ padding: '12px 0' }}>Status</th>
                <th style={{ padding: '12px 0', textAlign: 'right' }}>Access Control</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((emp) => (
                <tr key={emp.id} style={{ borderBottom: '1px solid #333', opacity: emp.status === 'Suspended' ? 0.5 : 1 }}>
                  <td style={{ padding: '12px 0', fontWeight: 'bold' }}>
                    {emp.name || emp.email}
                    {emp.role === 'Director' && <span style={{ marginLeft: '8px', fontSize: '12px' }}>👑</span>}
                  </td>
                  <td style={{ padding: '12px 0', color: '#D4AF37' }}>{emp.role}</td>
                  <td style={{ padding: '12px 0' }}>
                    <span style={{ color: emp.status === 'Suspended' ? '#F44336' : '#4CAF50', fontWeight: 'bold' }}>
                      {emp.status || 'Active'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 0', textAlign: 'right' }}>
                    {emp.role !== 'Director' && (
                      <button 
                        onClick={() => handleRevoke(emp.id, emp.status || 'Active')} 
                        style={{ backgroundColor: 'transparent', border: '1px solid ' + (emp.status === 'Suspended' ? '#4CAF50' : '#F44336'), color: emp.status === 'Suspended' ? '#4CAF50' : '#F44336', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        {emp.status === 'Suspended' ? 'RESTORE' : 'SUSPEND'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}