
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, LayoutDashboard, Settings as SettingsIcon, Plus, Search, Calendar, Upload, Trash2, Clock, 
  UserCheck, GraduationCap, X, Heart, Smile, ShieldCheck, UserPlus, Eye, EyeOff, GripVertical, 
  Stethoscope, Pill, ChevronDown, ChevronUp, PlusCircle, AlertCircle, ClipboardList, Edit2, 
  FileText, Minimize2, Maximize2, Bell, CheckSquare, Square, ArrowUpDown, AlertTriangle, 
  Settings2, Sparkles, CheckCircle2, UserCog
} from 'lucide-react';
import { db } from './firebase';
import { 
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch, query, 
  orderBy, addDoc, getDoc, serverTimestamp 
} from 'firebase/firestore';
import { 
  Student, ClassConfig, Tab, Medication, Allergy 
} from './types';
import { 
  DEFAULT_CLASSES, COLORS 
} from './constants';
import { 
  getEffectiveClass, formatDetailedAge, getProjectedTransitionDate, parseDate, standardizeDateDisplay 
} from './utils';
import { ClassBarChart } from './components/ClassBarChart';
import { getEnrollmentInsights } from './services/gemini';

enum RosterFilter {
  ALL = 'all', ACTIVE = 'active', WAITLISTED = 'waitlisted', GRADUATED = 'graduated'
}

type SortKey = 'name' | 'dob' | 'class';
type SortDirection = 'asc' | 'desc';

interface ExpiringItem {
  studentName: string; studentId: string; itemName: string; type: 'Medication' | 'Form'; 
  daysLeft: number; date: string;
}

interface RosterDisplaySettings {
  showDob: boolean; showAge: boolean; showTransition: boolean;
}

const PrimroseLogo = () => (
  <div className="flex items-center space-x-3">
    <div className="shrink-0">
      <svg viewBox="0 0 100 100" className="w-10 h-10 fill-white">
        <circle cx="50" cy="50" r="45" fill="none" stroke="white" strokeWidth="2" />
        <path d="M50 20 C60 20, 65 30, 65 45 C65 60, 60 75, 50 75 C40 75, 35 60, 35 45 C35 30, 40 20, 50 20" fill="none" stroke="white" strokeWidth="1.5" />
        <path d="M45 42 L55 42 M42 50 L58 50 M45 58 L55 58" stroke="white" strokeWidth="1.5" />
        <path d="M50 35 Q55 35 58 40 Q62 45 60 55 Q58 65 50 65 Q42 65 40 55 Q38 45 42 40 Q45 35 50 35 Z" fill="white" />
        <path d="M62 48 L72 45 Q75 42 70 38 L65 42" fill="white" />
      </svg>
    </div>
    <div className="flex flex-col leading-none">
      <span className="text-base font-bold tracking-tight uppercase text-white">Primrose School</span>
      <span className="text-[10px] font-semibold opacity-90 uppercase tracking-[0.1em] mt-0.5 text-white">of Waxhaw</span>
    </div>
  </div>
);

const autoFormatDate = (input: string): string => {
  const digits = input.replace(/\D/g, '').substring(0, 8);
  if (digits.length > 4) return `${digits.substring(0, 2)}/${digits.substring(2, 4)}/${digits.substring(4)}`;
  else if (digits.length > 2) return `${digits.substring(0, 2)}/${digits.substring(2)}`;
  return digits;
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.DASHBOARD);
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>(RosterFilter.ACTIVE);
  const [projectionDate, setProjectionDate] = useState<string>(new Date().toLocaleDateString('en-US'));
  const [students, setStudents] = useState<Student[]>([]);
  const [classSettings, setClassSettings] = useState<ClassConfig[]>(DEFAULT_CLASSES);
  const [classDisplaySettings, setClassDisplaySettings] = useState<Record<string, RosterDisplaySettings>>({});
  
  const [isChartMinimized, setIsChartMinimized] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  // Modals & States
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [isEditingStudent, setIsEditingStudent] = useState<Student | null>(null);
  const [isBulkAdding, setIsBulkAdding] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [newStudent, setNewStudent] = useState({ name: '', dob: '' });
  const [relModalData, setRelModalData] = useState<{ sourceId: string, search: string, type: 'S' | 'F' } | null>(null);
  const [highlightedStudentId, setHighlightedStudentId] = useState<string | null>(null);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [allergyEntry, setAllergyEntry] = useState<{ studentId: string; id?: string; substance: string; severity: Allergy['severity']; lastReaction: string; comments: string } | null>(null);
  const [medEntry, setMedEntry] = useState<{ studentId: string; id?: string; name: string; frequency: string; expiration: string } | null>(null);
  const [openSettingsClass, setOpenSettingsClass] = useState<string | null>(null);
  const [insights, setInsights] = useState<string | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  // Firestore Sync: Students
  useEffect(() => {
    try {
      const q = query(collection(db, "students"), orderBy("name", "asc"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const studentData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
        setStudents(studentData);
      }, (error) => {
        console.error("Firestore Students Error:", error);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Setup Students Listener Error:", e);
    }
  }, []);

  // Firestore Sync: Settings
  useEffect(() => {
    try {
      const unsubscribe = onSnapshot(doc(db, "settings", "global"), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.classSettings) setClassSettings(data.classSettings);
          if (data.projectionDate) setProjectionDate(data.projectionDate);
          if (data.classDisplaySettings) setClassDisplaySettings(data.classDisplaySettings);
        }
      }, (error) => {
        console.error("Firestore Settings Error:", error);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Setup Settings Listener Error:", e);
    }
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showConfirmation = (msg: string) => setToast(msg);

  const saveGlobalSettings = async (updates: any) => {
    try {
      await setDoc(doc(db, "settings", "global"), updates, { merge: true });
    } catch (e) {
      console.error("Save Settings Error:", e);
      showConfirmation("Error: Connection Failed");
    }
  };

  const manualAssignments = useMemo(() => {
    return students.reduce((acc, s) => {
      if ((s as any).manualClass) acc[s.id] = (s as any).manualClass;
      return acc;
    }, {} as Record<string, string>);
  }, [students]);

  const waitlistedAssignments = useMemo(() => {
    return students.reduce((acc, s) => {
      if ((s as any).isWaitlisted) acc[s.id] = (s as any).isWaitlisted;
      return acc;
    }, {} as Record<string, boolean>);
  }, [students]);

  const manualTransitionDates = useMemo(() => {
    return students.reduce((acc, s) => {
      if ((s as any).manualTransitionDate) acc[s.id] = (s as any).manualTransitionDate;
      return acc;
    }, {} as Record<string, string>);
  }, [students]);

  const expirationGroups = useMemo(() => {
    const urgent: ExpiringItem[] = [];
    const upcoming: ExpiringItem[] = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    students.forEach(s => {
      s.medications.forEach(m => {
        const expDate = parseDate(m.expirationDate);
        if (expDate) {
          const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          const item = { studentName: s.name, studentId: s.id, itemName: m.name, type: 'Medication' as const, daysLeft: diffDays, date: m.expirationDate };
          if (diffDays >= 0 && diffDays <= 7) urgent.push(item);
          else if (diffDays > 7 && diffDays <= 30) upcoming.push(item);
        }
      });
      if (s.documentExpirationDate) {
        const expDate = parseDate(s.documentExpirationDate);
        if (expDate) {
          const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          const item = { studentName: s.name, studentId: s.id, itemName: 'Medical Form', type: 'Form' as const, daysLeft: diffDays, date: s.documentExpirationDate };
          if (diffDays >= 0 && diffDays <= 7) urgent.push(item);
          else if (diffDays > 7 && diffDays <= 30) upcoming.push(item);
        }
      }
    });
    return { urgent, upcoming, total: urgent.length + upcoming.length };
  }, [students]);

  const totals = useMemo(() => {
    const activeClasses = classSettings.filter(c => !c.hidden && !c.isSpecial);
    const capacity = activeClasses.reduce((acc, c) => acc + (c.capacity || 0), 0);
    const enrolledCount = students.filter(s => {
      const clsName = getEffectiveClass(s, projectionDate, classSettings, manualAssignments, manualTransitionDates);
      return !waitlistedAssignments[s.id] && activeClasses.some(ac => ac.name === clsName);
    }).length;
    const totalFTE = students.reduce((acc, s) => {
      const clsName = getEffectiveClass(s, projectionDate, classSettings, manualAssignments, manualTransitionDates);
      return (clsName !== 'Graduated/Withdrawn' && !waitlistedAssignments[s.id]) ? acc + (s.fte || 0) : acc;
    }, 0);
    return { enrolled: enrolledCount, capacity, vacancies: Math.max(0, capacity - enrolledCount), totalFTE };
  }, [students, classSettings, projectionDate, manualAssignments, waitlistedAssignments, manualTransitionDates]);

  const dashboardData = useMemo(() => {
    return classSettings.filter(c => !c.hidden && !c.isSpecial).map(cls => {
      const classStudents = students.filter(s => getEffectiveClass(s, projectionDate, classSettings, manualAssignments, manualTransitionDates) === cls.name);
      const enrolled = classStudents.filter(s => !waitlistedAssignments[s.id]);
      const waitlisted = classStudents.filter(s => !!waitlistedAssignments[s.id]);
      return { name: cls.name, enrolled: enrolled.length, capacity: cls.capacity, waitlisted: waitlisted.length };
    });
  }, [students, classSettings, projectionDate, manualAssignments, waitlistedAssignments, manualTransitionDates]);

  const filteredStudents = useMemo(() => {
    let result = students.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
      const currentClass = getEffectiveClass(s, projectionDate, classSettings, manualAssignments, manualTransitionDates);
      const isWaitlisted = !!waitlistedAssignments[s.id];
      const isGraduated = currentClass === 'Graduated/Withdrawn';
      if (rosterFilter === RosterFilter.ACTIVE) return matchesSearch && !isWaitlisted && !isGraduated;
      if (rosterFilter === RosterFilter.WAITLISTED) return matchesSearch && isWaitlisted;
      if (rosterFilter === RosterFilter.GRADUATED) return matchesSearch && isGraduated;
      return matchesSearch;
    });
    result.sort((a, b) => {
      let valA: any = a[sortKey as keyof Student] || '';
      let valB: any = b[sortKey as keyof Student] || '';
      if (sortKey === 'class') {
        valA = getEffectiveClass(a, projectionDate, classSettings, manualAssignments, manualTransitionDates);
        valB = getEffectiveClass(b, projectionDate, classSettings, manualAssignments, manualTransitionDates);
      }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [students, searchTerm, rosterFilter, projectionDate, classSettings, manualAssignments, waitlistedAssignments, manualTransitionDates, sortKey, sortDir]);

  const handleUpdateStudent = async (id: string, updates: Partial<Student>) => {
    try {
      await updateDoc(doc(db, "students", id), updates);
    } catch (e) {
      console.error("Update Student Error:", e);
      showConfirmation("Error: Connection Failed");
    }
  };

  const handleAddRelationship = async (sourceId: string, targetId: string, type: 'S' | 'F') => {
    const batch = writeBatch(db);
    const sourceRef = doc(db, "students", sourceId);
    const targetRef = doc(db, "students", targetId);

    try {
      const sourceSnap = await getDoc(sourceRef);
      const targetSnap = await getDoc(targetRef);

      if (sourceSnap.exists() && targetSnap.exists()) {
        const sourceRel = sourceSnap.data().relationships || [];
        const targetRel = targetSnap.data().relationships || [];

        if (!sourceRel.some((r: any) => r.targetId === targetId)) {
          batch.update(sourceRef, { relationships: [...sourceRel, { targetId, type }] });
        }
        if (!targetRel.some((r: any) => r.targetId === sourceId)) {
          batch.update(targetRef, { relationships: [...targetRel, { targetId: sourceId, type }] });
        }
        await batch.commit();
        showConfirmation(type === 'S' ? "Sibling link established" : "Friend link established");
      }
    } catch (e) {
      console.error("Add Relationship Error:", e);
      showConfirmation("Error: Connection Failed");
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.name || !newStudent.dob) return;
    try {
      await addDoc(collection(db, "students"), {
        name: newStudent.name,
        dob: standardizeDateDisplay(newStudent.dob),
        fte: 1.0, isStaffChild: false, isPromo: false, relationships: [], 
        allergies: [], medications: [], emergencyContact: '',
        createdAt: serverTimestamp()
      });
      setIsAddingStudent(false);
      setNewStudent({ name: '', dob: '' });
      showConfirmation("Student enrolled successfully");
    } catch (e) {
      console.error("Add Student Error:", e);
      showConfirmation("Error: Connection Failed");
    }
  };

  const handleBulkAdd = async () => {
    const lines = bulkInput.split('\n').filter(l => l.trim());
    const batch = writeBatch(db);
    let count = 0;
    
    lines.forEach(line => {
      // Split by common Excel/CSV separators
      const parts = line.split(/[,\t]/).map(p => p.trim()).filter(Boolean);
      if (parts.length < 2) return;
      
      let detectedName = "";
      let detectedDob = "";
      
      // Attempt to find which column is the date
      // In Excel exports, it's often the last column (Peggy [Tab] Green [Tab] 05/12/2022)
      let dateIndex = -1;
      for (let i = parts.length - 1; i >= 0; i--) {
        if (parseDate(parts[i])) {
          dateIndex = i;
          break;
        }
      }

      if (dateIndex !== -1) {
        detectedDob = standardizeDateDisplay(parts[dateIndex]);
        // Combine everything before the date as the name (e.g., "Peggy Green")
        detectedName = parts.slice(0, dateIndex).join(" ");
      } else {
        // Fallback to simple format if no clear date found
        detectedName = parts[0];
        detectedDob = parts[1];
      }

      const validDate = parseDate(detectedDob);
      if (detectedName && validDate) {
        const ref = doc(collection(db, "students"));
        batch.set(ref, { 
          name: detectedName, 
          dob: detectedDob, 
          fte: 1.0, 
          isStaffChild: false, isPromo: false, relationships: [], 
          allergies: [], medications: [], emergencyContact: '',
          createdAt: serverTimestamp()
        });
        count++;
      }
    });

    if (count > 0) {
      try {
        await batch.commit();
        showConfirmation(`Successfully uploaded ${count} records`);
      } catch (e) {
        console.error("Batch Commit Error:", e);
        showConfirmation("Error: Permission Denied or Connection Failed");
      }
    } else {
      showConfirmation("No valid records found. Check format: Name [Tab] Date");
    }
    
    setIsBulkAdding(false);
    setBulkInput('');
  };

  const getTransitiveGroup = (startId: string): Student[] => {
    const groupIds = new Set<string>();
    const stack = [startId];
    while (stack.length > 0) {
      const currentId = stack.pop()!;
      if (!groupIds.has(currentId)) {
        groupIds.add(currentId);
        const student = students.find(s => s.id === currentId);
        if (student) student.relationships.forEach(r => { if (!groupIds.has(r.targetId)) stack.push(r.targetId); });
      }
    }
    groupIds.delete(startId);
    return Array.from(groupIds).map(id => students.find(s => s.id === id)).filter(Boolean) as Student[];
  };

  const RelationshipHoverDetails: React.FC<{ studentId: string }> = ({ studentId }) => {
    const group = getTransitiveGroup(studentId);
    if (group.length === 0) return null;
    return (
      <div className="fixed z-[9999] bg-slate-900 text-white p-6 rounded-[2rem] shadow-2xl min-w-[320px] border border-slate-700 pointer-events-none animate-in zoom-in-95 duration-200" style={{ transform: 'translate(-50%, -115%)', left: '50%', top: '0' }}>
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 mb-4 border-b border-white/10 pb-2">Network Connections</p>
        <div className="space-y-4">
          {group.map(target => {
            const relType = target.relationships.find(r => r.targetId === studentId)?.type || 'S';
            return (
              <div key={target.id} className="flex flex-col">
                <span className="text-[14px] font-bold flex items-center">
                  {relType === 'S' ? <Heart className="w-4 h-4 mr-2 text-rose-400" /> : <Smile className="w-4 h-4 mr-2 text-sky-400" />}
                  {target.name}
                </span>
                <span className="text-[9px] text-slate-400 uppercase font-black ml-6">
                  {getEffectiveClass(target, projectionDate, classSettings, manualAssignments, manualTransitionDates)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const updateClassDisplay = (className: string, key: keyof RosterDisplaySettings) => {
    const current = classDisplaySettings[className] || { showDob: false, showAge: false, showTransition: false };
    const next = { ...current, [key]: !current[key] };
    saveGlobalSettings({ classDisplaySettings: { ...classDisplaySettings, [className]: next } });
  };

  return (
    <div className="min-h-screen flex bg-slate-50 font-sans tracking-tight">
      {/* Sidebar */}
      <aside className="w-72 flex flex-col shadow-xl fixed h-full z-20 overflow-hidden" style={{ backgroundColor: COLORS.brandGreen, color: '#fff' }}>
        <div className="p-8 border-b border-white/5"><PrimroseLogo /></div>
        <nav className="flex-1 px-5 py-8 space-y-2">
          <button onClick={() => setActiveTab(Tab.DASHBOARD)} className={`w-full flex items-center space-x-4 px-6 py-4 rounded-xl transition-all font-bold text-[12px] uppercase tracking-wider ${activeTab === Tab.DASHBOARD ? 'bg-white/20 text-white shadow-lg' : 'hover:bg-white/10 opacity-70 hover:opacity-100'}`}><LayoutDashboard className="w-5 h-5" /><span>Dashboard</span></button>
          <button onClick={() => setActiveTab(Tab.ROSTER)} className={`w-full flex items-center space-x-4 px-6 py-4 rounded-xl transition-all font-bold text-[12px] uppercase tracking-wider ${activeTab === Tab.ROSTER ? 'bg-white/20 text-white shadow-lg' : 'hover:bg-white/10 opacity-70 hover:opacity-100'}`}><Users className="w-5 h-5" /><span>Student Roster</span></button>
          <button onClick={() => setActiveTab(Tab.MEDICAL)} className={`w-full relative flex items-center space-x-4 px-6 py-4 rounded-xl transition-all font-bold text-[12px] uppercase tracking-wider ${activeTab === Tab.MEDICAL ? 'bg-white/20 text-white shadow-lg' : 'hover:bg-white/10 opacity-70 hover:opacity-100'}`}>
            <Stethoscope className="w-5 h-5" />
            <span>Medical Tracker</span>
            {expirationGroups.total > 0 && (
              <span className={`absolute top-3 right-4 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-[10px] text-white shadow-lg border-2 border-white font-black ${expirationGroups.urgent.length > 0 ? 'animate-bounce' : ''}`}>
                {expirationGroups.total}
              </span>
            )}
          </button>
          <button onClick={() => setActiveTab(Tab.SETTINGS)} className={`w-full flex items-center space-x-4 px-6 py-4 rounded-xl transition-all font-bold text-[12px] uppercase tracking-wider ${activeTab === Tab.SETTINGS ? 'bg-white/20 text-white shadow-lg' : 'hover:bg-white/10 opacity-70 hover:opacity-100'}`}><SettingsIcon className="w-5 h-5" /><span>Configurations</span></button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-72 p-10 overflow-y-auto">
        {/* Toast Notification */}
        {toast && (
          <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[9999] bg-slate-900 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-full duration-300 border border-white/10">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-[12px] font-bold uppercase tracking-widest">{toast}</span>
          </div>
        )}

        <header className="flex justify-between items-center mb-8 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 capitalize tracking-tight">
              {activeTab === Tab.MEDICAL ? 'Medical & Safety' : activeTab === Tab.ROSTER ? 'Student Roster' : activeTab}
            </h1>
            <p className="text-slate-400 font-bold text-[10px] mt-1 uppercase tracking-[0.2em]">Management Console</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative flex items-center bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3 shadow-inner min-w-[160px]">
              <Calendar className="w-4 h-4 text-slate-400 mr-2" />
              <input 
                type="text" 
                placeholder="MM/DD/YYYY"
                value={projectionDate} 
                onChange={(e) => saveGlobalSettings({ projectionDate: autoFormatDate(e.target.value) })} 
                className="bg-transparent border-none text-xs font-bold text-slate-700 focus:ring-0 outline-none p-0 w-full" 
              />
            </div>
            <button onClick={() => setIsAddingStudent(true)} className="text-white px-6 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-wider flex items-center space-x-2 transition-all shadow-lg hover:scale-105" style={{ backgroundColor: COLORS.brandBlue }}><Plus className="w-4 h-4" /><span>Enroll Student</span></button>
          </div>
        </header>

        {activeTab === Tab.DASHBOARD && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
            {/* Dashboard Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-all">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Enrollment Total</p>
                <div className="flex items-baseline space-x-2 mt-3"><span className="text-3xl font-bold text-slate-800 tracking-tight">{totals.enrolled}</span><span className="text-slate-400 font-bold text-sm">/ {totals.capacity}</span></div>
              </div>
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-all">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Current Vacancies</p>
                <div className="flex items-baseline space-x-2 mt-3"><span className="text-3xl font-bold text-slate-800 tracking-tight">{totals.vacancies}</span></div>
              </div>
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-all">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Active FTE</p>
                <div className="flex items-baseline space-x-2 mt-3"><span className="text-3xl font-bold text-slate-800 tracking-tight">{totals.totalFTE.toFixed(1)}</span></div>
              </div>
            </div>

            {/* AI Insights */}
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-500" /> AI Enrollment Insights
                </h3>
                <button onClick={async () => {
                  setLoadingInsights(true);
                  try {
                    const result = await getEnrollmentInsights(students, classSettings, projectionDate);
                    setInsights(result || "No insights available.");
                  } catch(e) { setInsights("Error generating insights."); }
                  finally { setLoadingInsights(false); }
                }} disabled={loadingInsights} className="flex items-center space-x-2 px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest bg-slate-800 text-white hover:bg-slate-900 transition-all disabled:opacity-50">
                  {loadingInsights ? 'Analyzing...' : 'Generate Analysis'}
                </button>
              </div>
              {insights ? (
                <div className="prose prose-sm max-w-none text-slate-600 bg-slate-50 p-6 rounded-2xl border border-slate-100 shadow-inner">
                  <div className="whitespace-pre-wrap font-medium">{insights}</div>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400 italic text-sm border-2 border-dashed border-slate-100 rounded-[2.5rem]">
                  {loadingInsights ? 'Gemini is processing your roster data...' : 'Strategic analysis pending.'}
                </div>
              )}
            </div>

            {/* Capacity Chart */}
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-800 tracking-tight">Class Capacity</h3>
                <button onClick={() => setIsChartMinimized(!isChartMinimized)} className="p-2 hover:bg-slate-50 rounded-xl transition-all">
                  {isChartMinimized ? <Maximize2 className="w-5 h-5 text-slate-400" /> : <Minimize2 className="w-5 h-5 text-slate-400" />}
                </button>
              </div>
              {!isChartMinimized && <ClassBarChart data={dashboardData} />}
            </div>

            {/* Class Lists */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
              {classSettings.filter(c => !c.hidden && !c.isSpecial).map(cls => {
                const enrolled = students.filter(s => getEffectiveClass(s, projectionDate, classSettings, manualAssignments, manualTransitionDates) === cls.name && !waitlistedAssignments[s.id]);
                const settings = classDisplaySettings[cls.name] || { showDob: false, showAge: false, showTransition: false };
                const isSettingsOpen = openSettingsClass === cls.name;

                return (
                  <div key={cls.name} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { 
                    e.preventDefault(); 
                    const studentId = e.dataTransfer.getData("studentId"); 
                    if (!studentId) return; 
                    handleUpdateStudent(studentId, { subdivisionIndex: 0, manualClass: cls.name } as any); 
                  }} className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full min-h-[350px] transition-all hover:shadow-xl relative">
                    <div className="p-5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                      <h4 className="font-bold text-slate-800 text-[10px] uppercase tracking-widest truncate">{cls.name}</h4>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setOpenSettingsClass(isSettingsOpen ? null : cls.name)} className={`p-1.5 rounded-lg transition-colors ${isSettingsOpen ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:bg-slate-100'}`}><Settings2 className="w-4 h-4" /></button>
                        <span className="text-[10px] px-2.5 py-1 rounded-lg font-black bg-white border border-slate-200 text-slate-600 shadow-sm">{enrolled.length}/{cls.capacity}</span>
                      </div>
                    </div>

                    {isSettingsOpen && (
                      <div className="absolute top-16 right-5 left-5 z-20 bg-white shadow-2xl rounded-2xl border border-slate-100 p-4 space-y-3 animate-in zoom-in-95 duration-200">
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em] mb-2">Display Controls</p>
                        {['showDob', 'showAge', 'showTransition'].map((key) => (
                          <label key={key} className="flex items-center justify-between cursor-pointer group">
                            <span className="text-[10px] font-bold text-slate-600">{key === 'showDob' ? 'Show Birthdays' : key === 'showAge' ? 'Show Age (y/m)' : 'Transition Dates'}</span>
                            <input type="checkbox" checked={(settings as any)[key]} onChange={() => updateClassDisplay(cls.name, key as any)} className="w-4 h-4 rounded text-indigo-600" />
                          </label>
                        ))}
                      </div>
                    )}

                    <div className="p-4 space-y-3 flex-1 max-h-[500px] overflow-y-auto custom-scrollbar">
                      {enrolled.length === 0 ? <div className="h-full flex items-center justify-center py-10 opacity-30 italic text-[11px]">No students assigned</div> : enrolled.map(s => {
                        const transitionDate = getProjectedTransitionDate(s, cls.name, classSettings);
                        const hasSafetyIssues = s.allergies.length > 0 || s.medications.length > 0;
                        return (
                          <div key={s.id} draggable onDragStart={(e) => e.dataTransfer.setData("studentId", s.id)} onMouseEnter={() => setHighlightedStudentId(s.id)} onMouseLeave={() => setHighlightedStudentId(null)} className="group relative flex flex-col p-4 rounded-2xl border border-slate-100 bg-slate-50/30 hover:bg-white hover:shadow-md hover:border-slate-200 transition-all cursor-grab active:cursor-grabbing">
                            <div className="flex items-center space-x-2">
                              <GripVertical className="w-3.5 h-3.5 text-slate-300" />
                              <span className="font-bold text-[12px] truncate text-slate-800">{s.name}</span>
                              {s.isStaffChild && <ShieldCheck className="w-3.5 h-3.5" style={{ color: COLORS.staffPurple }} />}
                              {hasSafetyIssues && <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
                            </div>
                            {(settings.showDob || settings.showAge || settings.showTransition) && (
                              <div className="mt-2.5 space-y-1.5 pl-6 border-l-2 border-slate-200 ml-1.5">
                                {settings.showDob && <p className="text-[10px] font-semibold text-slate-400 flex items-center gap-2 uppercase tracking-tighter"><Calendar className="w-3 h-3" /> {s.dob}</p>}
                                {settings.showAge && <p className="text-[10px] font-bold text-indigo-600 flex items-center gap-2 uppercase tracking-tighter"><Clock className="w-3 h-3" /> {formatDetailedAge(s.dob, projectionDate)}</p>}
                                {settings.showTransition && transitionDate && <p className="text-[9px] font-black text-emerald-600 flex items-center gap-2 uppercase tracking-tighter bg-emerald-50 px-2 py-0.5 rounded-md w-fit mt-1">Next: {transitionDate}</p>}
                              </div>
                            )}
                            {highlightedStudentId === s.id && <RelationshipHoverDetails studentId={s.id} />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Roster Tab */}
        {activeTab === Tab.ROSTER && (
          <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex space-x-2 bg-slate-100 p-1.5 rounded-3xl w-fit">
                {[{ id: RosterFilter.ACTIVE, label: 'Active', icon: UserCheck }, { id: RosterFilter.WAITLISTED, label: 'Waitlist', icon: Clock }, { id: RosterFilter.GRADUATED, label: 'Withdrawn', icon: GraduationCap }, { id: RosterFilter.ALL, label: 'Full Registry', icon: Users }].map(({ id, label, icon: Icon }) => (
                  <button key={id} onClick={() => setRosterFilter(id)} className={`flex items-center space-x-3 px-6 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-wider transition-all ${rosterFilter === id ? 'bg-white text-slate-800 shadow-md' : 'text-slate-400 hover:text-slate-700'}`} style={{ color: rosterFilter === id ? COLORS.brandGreen : '' }}><Icon className="w-4 h-4" /><span>{label}</span></button>
                ))}
              </div>
              <div className="flex items-center gap-4">
                {selectedIds.size > 0 && (
                  <button onClick={async () => { if(window.confirm(`Permanently remove ${selectedIds.size} records?`)) { const batch = writeBatch(db); selectedIds.forEach(id => batch.delete(doc(db, "students", id))); await batch.commit(); setSelectedIds(new Set()); showConfirmation(`Removed ${selectedIds.size} records`); } }} className="bg-rose-600 text-white px-6 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-lg hover:bg-rose-700 transition-all flex items-center gap-3 animate-in fade-in slide-in-from-right-4"><Trash2 className="w-4 h-4" /> Delete ({selectedIds.size})</button>
                )}
                <button onClick={() => setIsBulkAdding(true)} className="px-8 py-3 bg-slate-800 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-900 transition-all flex items-center space-x-2 shadow-lg"><Upload className="w-4 h-4" /><span>Upload Data</span></button>
              </div>
            </div>
            
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
               <div className="p-8 border-b border-slate-100 flex items-center justify-between gap-6">
                <div className="relative flex-1">
                  <Search className="w-5 h-5 absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input type="text" placeholder="Filter roster directory..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-16 pr-8 py-5 bg-slate-50 border-none rounded-[1.5rem] text-sm font-semibold focus:ring-2 focus:ring-slate-100 outline-none shadow-inner" />
                </div>
              </div>
               <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-slate-50/50 border-b border-slate-100">
                    <tr>
                      <th className="px-8 py-6 w-16">
                        <button onClick={() => { if (selectedIds.size === filteredStudents.length && filteredStudents.length > 0) setSelectedIds(new Set()); else setSelectedIds(new Set(filteredStudents.map(s => s.id))); }} className="p-1 hover:bg-white rounded-lg transition-colors">
                          {selectedIds.size === filteredStudents.length && filteredStudents.length > 0 ? <CheckSquare className="w-4.5 h-4.5 text-indigo-600" /> : <Square className="w-4.5 h-4.5 text-slate-300" />}
                        </button>
                      </th>
                      <th className="px-4 py-6 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest w-12">#</th>
                      <th className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest sticky left-0 bg-slate-50">Student</th>
                      <th className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">DOB</th>
                      <th className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Current Class</th>
                      <th className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">FTE</th>
                      <th className="px-8 py-6 text-right">Utility</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredStudents.map((s, idx) => {
                      const isExpanded = expandedStudentId === s.id;
                      const currentClass = getEffectiveClass(s, projectionDate, classSettings, manualAssignments, manualTransitionDates);
                      const isSelected = selectedIds.has(s.id);
                      return (
                        <React.Fragment key={s.id}>
                          <tr className={`hover:bg-slate-50 transition-all group ${isExpanded ? 'bg-slate-50' : ''} ${isSelected ? 'bg-indigo-50/30' : ''}`}>
                            <td className="px-8 py-6"><button onClick={() => { const next = new Set(selectedIds); if (next.has(s.id)) next.delete(s.id); else next.add(s.id); setSelectedIds(next); }} className="p-1 hover:bg-white rounded-lg transition-colors">{isSelected ? <CheckSquare className="w-4.5 h-4.5 text-indigo-600" /> : <Square className="w-4.5 h-4.5 text-slate-200 group-hover:text-slate-300" />}</button></td>
                            <td className="px-4 py-6 text-center text-[11px] font-bold text-slate-300">{idx + 1}</td>
                            <td className="px-8 py-6 sticky left-0 bg-white group-hover:bg-slate-50 z-10 min-w-[240px]">
                              <div className="flex items-center space-x-4">
                                <button onClick={() => setExpandedStudentId(isExpanded ? null : s.id)} className="p-1.5 hover:bg-slate-100 rounded-xl transition-all">{isExpanded ? <ChevronUp className="w-4.5 h-4.5 text-slate-400" /> : <ChevronDown className="w-4.5 h-4.5 text-slate-400" />}</button>
                                <span className="font-bold text-[13px] text-slate-800">{s.name}</span>
                              </div>
                            </td>
                            <td className="px-8 py-6 text-xs font-bold text-slate-500 text-center">{s.dob}</td>
                            <td className="px-8 py-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">{currentClass}</td>
                            <td className="px-8 py-6 text-center font-bold text-slate-600">{s.fte.toFixed(1)}</td>
                            <td className="px-8 py-6 text-right"><button onClick={async () => { if(window.confirm('Remove record?')) { await deleteDoc(doc(db, "students", s.id)); showConfirmation("Record removed"); } }} className="p-2.5 text-slate-200 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-4.5 h-4.5" /></button></td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-slate-50/50"><td colSpan={7} className="px-12 py-10 border-l-[6px] border-slate-300 shadow-inner">
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
                                <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
                                  <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center space-x-3"><ClipboardList className="w-4 h-4" /><span>Administrative</span></h5>
                                  <div className="space-y-4">
                                    <button onClick={() => setIsEditingStudent(s)} className="w-full py-3.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-bold uppercase flex items-center justify-center space-x-3 border border-slate-100 transition-all shadow-sm"><UserCog className="w-4 h-4" /><span>Edit Identity</span></button>
                                    <label className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors"><span className="text-[10px] font-bold text-slate-500 uppercase">Staff Child</span><input type="checkbox" checked={s.isStaffChild} onChange={e => handleUpdateStudent(s.id, { isStaffChild: e.target.checked })} className="w-5 h-5 rounded-lg text-indigo-600" /></label>
                                    <button onClick={() => setRelModalData({ sourceId: s.id, search: '', type: 'S' })} className="w-full py-3.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-2xl text-[10px] font-bold uppercase flex items-center justify-center space-x-3 border border-indigo-100 transition-all shadow-sm"><UserPlus className="w-4 h-4" /><span>Link Connections</span></button>
                                  </div>
                                </div>
                                {/* Health panels */}
                                <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
                                  <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center space-x-3"><AlertCircle className="w-4 h-4 text-rose-500" /><span>Safety Profile</span></h5>
                                  <div className="space-y-3">{s.allergies?.map(a => (<div key={a.id} className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center group/item border border-slate-100 shadow-sm"><div><p className="text-[11px] font-bold text-slate-800">{a.substance}</p></div></div>))}
                                  <button onClick={() => setAllergyEntry({ studentId: s.id, substance: '', severity: 'Moderate', lastReaction: '', comments: '' })} className="w-full py-3 bg-rose-50/50 text-rose-600 rounded-2xl text-[10px] font-bold uppercase border-2 border-dashed border-rose-100 flex items-center justify-center space-x-3 transition-all hover:bg-rose-50"><PlusCircle className="w-4 h-4" /><span>Add Allergy</span></button></div>
                                </div>
                                <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
                                  <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center space-x-3"><Pill className="w-4 h-4 text-indigo-500" /><span>Medications</span></h5>
                                  <div className="space-y-3">{s.medications?.map(m => (<div key={m.id} className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center group/item border border-slate-100 shadow-sm"><div><p className="text-[11px] font-bold text-slate-800">{m.name}</p><p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Exp: {m.expirationDate}</p></div></div>))}
                                  <button onClick={() => setMedEntry({ studentId: s.id, name: '', frequency: '', expiration: '' })} className="w-full py-3 bg-indigo-50/50 text-indigo-600 rounded-2xl text-[10px] font-bold uppercase border-2 border-dashed border-indigo-100 flex items-center justify-center space-x-3 transition-all hover:bg-indigo-50"><PlusCircle className="w-4 h-4" /><span>Add Medication</span></button></div>
                                </div>
                                <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
                                  <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center space-x-3"><FileText className="w-4 h-4" /><span>Documentation</span></h5>
                                  <label className="block space-y-2"><span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Form Expiry</span><input type="text" placeholder="MM/DD/YYYY" value={s.documentExpirationDate || ''} onChange={e => handleUpdateStudent(s.id, { documentExpirationDate: autoFormatDate(e.target.value) })} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[11px] font-bold outline-none shadow-sm" /></label>
                                </div>
                              </div>
                            </td></tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Configurations Tab */}
        {activeTab === Tab.SETTINGS && (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 space-y-10 max-w-5xl mx-auto">
            <div className="bg-white p-16 rounded-[4rem] shadow-sm border border-slate-100">
              <h3 className="text-3xl font-bold text-slate-800 mb-12 flex items-center space-x-5"><SettingsIcon className="w-10 h-10" style={{ color: COLORS.brandGreen }} /><span>Configuration</span></h3>
              <div className="space-y-5">
                {classSettings.map((cls, idx) => (
                  <div key={cls.name} className={`px-12 py-6 rounded-3xl border-2 transition-all duration-300 ${cls.hidden ? 'bg-slate-50 border-slate-50 opacity-40' : 'bg-white border-slate-100 hover:border-slate-300 shadow-sm'}`}>
                    <div className="grid grid-cols-[1fr_140px_140px] gap-10 items-center">
                      <div className="flex items-center space-x-6">
                        <button onClick={() => saveGlobalSettings({ classSettings: classSettings.map((c, i) => i === idx ? { ...c, hidden: !c.hidden } : c) })} className="p-3 rounded-2xl transition-all bg-slate-50 text-slate-400 hover:text-slate-800 shadow-inner">{cls.hidden ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}</button>
                        <p className="font-black text-slate-800 text-[18px] tracking-tight">{cls.name}</p>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Max Capacity</span>
                        <input type="number" value={cls.capacity} onChange={(e) => saveGlobalSettings({ classSettings: classSettings.map((c, i) => i === idx ? { ...c, capacity: parseInt(e.target.value) || 0 } : c) })} className="w-20 p-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-center shadow-inner" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      {isAddingStudent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9999] flex items-center justify-center p-8">
          <div className="bg-white w-full max-w-sm rounded-[3.5rem] shadow-2xl p-12 animate-in zoom-in-95 duration-300">
            <h2 className="text-3xl font-bold mb-10 text-slate-800 text-center tracking-tight">Enroll Student</h2>
            <form onSubmit={handleAddStudent} className="space-y-8">
              <label className="block space-y-2"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Legal Name</span><input autoFocus type="text" required value={newStudent.name} onChange={(e) => setNewStudent({...newStudent, name: e.target.value})} className="w-full px-6 py-5 bg-slate-50 border-none rounded-2xl text-[18px] font-bold text-slate-800 shadow-inner" /></label>
              <label className="block space-y-2"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Birth Date (MM/DD/YYYY)</span><input type="text" placeholder="MM/DD/YYYY" required value={newStudent.dob} onChange={(e) => setNewStudent({...newStudent, dob: autoFormatDate(e.target.value)})} className="w-full px-6 py-5 bg-slate-50 border-none rounded-2xl text-base font-bold text-slate-800 shadow-inner" /></label>
              <div className="flex space-x-5 pt-4"><button type="button" onClick={() => setIsAddingStudent(false)} className="flex-1 py-5 bg-slate-100 rounded-2xl text-[11px] font-bold uppercase tracking-widest text-slate-400">Cancel</button><button type="submit" className="flex-1 py-5 text-white rounded-2xl text-[11px] font-bold uppercase tracking-widest bg-slate-800 shadow-2xl hover:bg-slate-900">Enroll</button></div>
            </form>
          </div>
        </div>
      )}

      {isEditingStudent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9999] flex items-center justify-center p-8">
          <div className="bg-white w-full max-w-sm rounded-[3.5rem] shadow-2xl p-12 animate-in zoom-in-95 duration-300">
            <h2 className="text-3xl font-bold mb-10 text-slate-800 text-center tracking-tight">Edit Identity</h2>
            <form onSubmit={async (e) => {
              e.preventDefault();
              await handleUpdateStudent(isEditingStudent.id, { name: isEditingStudent.name, dob: standardizeDateDisplay(isEditingStudent.dob) });
              setIsEditingStudent(null);
              showConfirmation("Student updated successfully");
            }} className="space-y-8">
              <label className="block space-y-2"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Legal Name</span><input autoFocus type="text" required value={isEditingStudent.name} onChange={(e) => setIsEditingStudent({...isEditingStudent, name: e.target.value})} className="w-full px-6 py-5 bg-slate-50 border-none rounded-2xl text-[18px] font-bold text-slate-800 shadow-inner" /></label>
              <label className="block space-y-2"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Birth Date (MM/DD/YYYY)</span><input type="text" placeholder="MM/DD/YYYY" required value={isEditingStudent.dob} onChange={(e) => setIsEditingStudent({...isEditingStudent, dob: autoFormatDate(e.target.value)})} className="w-full px-6 py-5 bg-slate-50 border-none rounded-2xl text-base font-bold text-slate-800 shadow-inner" /></label>
              <div className="flex space-x-5 pt-4"><button type="button" onClick={() => setIsEditingStudent(null)} className="flex-1 py-5 bg-slate-100 rounded-2xl text-[11px] font-bold uppercase tracking-widest text-slate-400">Cancel</button><button type="submit" className="flex-1 py-5 text-white rounded-2xl text-[11px] font-bold uppercase tracking-widest bg-slate-800 shadow-2xl hover:bg-slate-900">Update</button></div>
            </form>
          </div>
        </div>
      )}

      {isBulkAdding && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9999] flex items-center justify-center p-8">
          <div className="bg-white w-full max-w-2xl rounded-[3.5rem] shadow-2xl p-14 animate-in slide-in-from-top-12 duration-500">
            <h2 className="text-3xl font-bold mb-8 text-slate-800 tracking-tight">Bulk Registry Upload</h2>
            <p className="text-slate-400 text-xs mb-4">Paste directly from Excel. Supports multiple columns (First, Last, DOB).</p>
            <textarea rows={12} placeholder="Peggy	Green	05/12/2022" value={bulkInput} onChange={(e) => setBulkInput(e.target.value)} className="w-full px-8 py-7 bg-slate-50 border-none rounded-[2rem] outline-none font-mono text-sm shadow-inner focus:ring-4 focus:ring-slate-100" />
            <div className="flex space-x-5 mt-10"><button onClick={() => setIsBulkAdding(false)} className="flex-1 py-5 bg-slate-100 rounded-2xl text-[11px] font-bold uppercase tracking-widest text-slate-400">Cancel</button><button onClick={handleBulkAdd} className="flex-1 py-5 text-white rounded-2xl text-[11px] font-bold uppercase tracking-widest bg-slate-800 shadow-2xl">Upload Data</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
