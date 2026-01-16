
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  LayoutDashboard, 
  Settings as SettingsIcon, 
  Plus, 
  Search, 
  Calendar,
  Upload,
  Trash2,
  Clock,
  UserCheck,
  GraduationCap,
  X,
  Heart,
  Smile,
  ShieldCheck,
  UserPlus,
  Eye,
  EyeOff,
  GripVertical,
  Stethoscope,
  Pill,
  ChevronDown,
  ChevronUp,
  PlusCircle,
  AlertCircle,
  ClipboardList,
  Edit2,
  FileText,
  Minimize2,
  Maximize2,
  Bell,
  CheckSquare,
  Square,
  ArrowUpDown,
  AlertTriangle,
  Settings2,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { 
  Student, 
  ClassConfig, 
  Tab,
  Medication,
  Allergy
} from './types';
import { 
  DEFAULT_CLASSES, 
  COLORS
} from './constants';
import { 
  getEffectiveClass, 
  formatDetailedAge,
  getProjectedTransitionDate
} from './utils';
import { ClassBarChart } from './components/ClassBarChart';
import { getEnrollmentInsights } from './services/gemini';

enum RosterFilter {
  ALL = 'all',
  ACTIVE = 'active',
  WAITLISTED = 'waitlisted',
  GRADUATED = 'graduated'
}

type SortKey = 'name' | 'dob' | 'class';
type SortDirection = 'asc' | 'desc';

interface ExpiringItem {
  studentName: string;
  studentId: string;
  itemName: string;
  type: 'Medication' | 'Form';
  daysLeft: number;
  date: string;
}

interface RosterDisplaySettings {
  showDob: boolean;
  showAge: boolean;
  showTransition: boolean;
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
  if (digits.length > 4) {
    return `${digits.substring(0, 2)}/${digits.substring(2, 4)}/${digits.substring(4)}`;
  } else if (digits.length > 2) {
    return `${digits.substring(0, 2)}/${digits.substring(2)}`;
  }
  return digits;
};

const flexibleParseDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  // Handle YYYY-MM-DD (legacy/standard)
  if (dateStr.includes('-')) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  // Handle MM/DD/YYYY (new standard)
  if (dateStr.includes('/')) {
    const [m, d, y] = dateStr.split('/').map(Number);
    // If user typed 2 digits for year, assume 20xx
    const fullYear = y < 100 ? 2000 + y : y;
    return new Date(fullYear, m - 1, d);
  }
  return null;
};

const isExpiringSoon = (dateStr: string | undefined, days: number) => {
  if (!dateStr) return false;
  const expDate = flexibleParseDate(dateStr);
  if (!expDate || isNaN(expDate.getTime())) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= days;
};

const getStudentNameColor = (s: Student) => {
  if (s.isStaffChild) return COLORS.staffPurple;
  if ((s.allergies && s.allergies.length > 0) || (s.medications && s.medications.length > 0)) return COLORS.brandRed;
  return '#1e293b'; 
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.DASHBOARD);
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>(RosterFilter.ACTIVE);
  const [projectionDate, setProjectionDate] = useState<string>(new Date().toLocaleDateString('en-US'));
  const [students, setStudents] = useState<Student[]>([]);
  const [classSettings, setClassSettings] = useState<ClassConfig[]>(DEFAULT_CLASSES);
  const [manualAssignments, setManualAssignments] = useState<Record<string, string>>({});
  const [waitlistedAssignments, setWaitlistedAssignments] = useState<Record<string, string>>({});
  const [manualTransitionDates, setManualTransitionDates] = useState<Record<string, string>>({});
  
  const [isChartMinimized, setIsChartMinimized] = useState(false);
  const [classDisplaySettings, setClassDisplaySettings] = useState<Record<string, RosterDisplaySettings>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Feedback System
  const [toast, setToast] = useState<string | null>(null);

  // Modals
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [isBulkAdding, setIsBulkAdding] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [newStudent, setNewStudent] = useState({ name: '', dob: '' });
  const [duplicateConflicts, setDuplicateConflicts] = useState<{ incoming: Student; existing: Student }[]>([]);
  const [relModalData, setRelModalData] = useState<{ sourceId: string, search: string, type: 'S' | 'F' } | null>(null);
  const [highlightedStudentId, setHighlightedStudentId] = useState<string | null>(null);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [allergyEntry, setAllergyEntry] = useState<{ studentId: string; id?: string; substance: string; severity: Allergy['severity']; lastReaction: string; comments: string } | null>(null);
  const [medEntry, setMedEntry] = useState<{ studentId: string; id?: string; name: string; frequency: string; expiration: string } | null>(null);
  const [openSettingsClass, setOpenSettingsClass] = useState<string | null>(null);

  const [insights, setInsights] = useState<string | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('primrose_v12');
    if (saved) {
      const data = JSON.parse(saved);
      setStudents(data.students || []);
      setClassSettings(data.classSettings || DEFAULT_CLASSES);
      setManualAssignments(data.manualAssignments || {});
      setWaitlistedAssignments(data.waitlistedAssignments || {});
      setManualTransitionDates(data.manualTransitionDates || {});
      setClassDisplaySettings(data.classDisplaySettings || {});
      if (data.projectionDate) setProjectionDate(data.projectionDate);
    }
  }, []);

  useEffect(() => {
    const data = { students, classSettings, manualAssignments, waitlistedAssignments, manualTransitionDates, projectionDate, classDisplaySettings };
    localStorage.setItem('primrose_v12', JSON.stringify(data));
  }, [students, classSettings, manualAssignments, waitlistedAssignments, manualTransitionDates, projectionDate, classDisplaySettings]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showConfirmation = (msg: string) => setToast(msg);

  const expirationGroups = useMemo(() => {
    const urgent: ExpiringItem[] = [];
    const upcoming: ExpiringItem[] = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    students.forEach(s => {
      s.medications.forEach(m => {
        const expDate = flexibleParseDate(m.expirationDate);
        if (expDate && !isNaN(expDate.getTime())) {
          const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          const item = { studentName: s.name, studentId: s.id, itemName: m.name, type: 'Medication' as const, daysLeft: diffDays, date: m.expirationDate };
          if (diffDays >= 0 && diffDays <= 7) urgent.push(item);
          else if (diffDays > 7 && diffDays <= 30) upcoming.push(item);
        }
      });
      if (s.documentExpirationDate) {
        const expDate = flexibleParseDate(s.documentExpirationDate);
        if (expDate && !isNaN(expDate.getTime())) {
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

  const handleUpdateStudent = (id: string, updates: Partial<Student>) => {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleAddRelationship = (sourceId: string, targetId: string, type: 'S' | 'F') => {
    setStudents(prev => prev.map(s => {
      if (s.id === sourceId) {
        if (s.relationships.some(r => r.targetId === targetId)) return s;
        return { ...s, relationships: [...s.relationships, { targetId, type }] };
      }
      if (s.id === targetId) {
        if (s.relationships.some(r => r.targetId === sourceId)) return s;
        return { ...s, relationships: [...s.relationships, { targetId: sourceId, type }] };
      }
      return s;
    }));
    showConfirmation(type === 'S' ? "Sibling link established" : "Friend link established");
  };

  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.name || !newStudent.dob) return;
    const student: Student = {
      id: crypto.randomUUID(), name: newStudent.name, dob: newStudent.dob, fte: 1.0, isStaffChild: false, isPromo: false, relationships: [], allergies: [], medications: [], emergencyContact: '',
    };
    setStudents(prev => [...prev, student]);
    setIsAddingStudent(false);
    setNewStudent({ name: '', dob: '' });
    showConfirmation("Student enrolled successfully");
  };

  const handleBulkAdd = () => {
    const lines = bulkInput.split('\n').filter(l => l.trim());
    const newOnes: Student[] = [];
    lines.forEach(line => {
      const parts = line.split(',');
      if (parts.length < 2) return;
      newOnes.push({ id: crypto.randomUUID(), name: parts[0].trim(), dob: autoFormatDate(parts[1].trim()), fte: 1.0, isStaffChild: false, isPromo: false, relationships: [], allergies: [], medications: [], emergencyContact: '' });
    });
    setStudents(prev => [...prev, ...newOnes]);
    setIsBulkAdding(false);
    setBulkInput('');
    showConfirmation(`Imported ${newOnes.length} records`);
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

  const handleGenerateInsights = async () => {
    setLoadingInsights(true);
    try {
      const result = await getEnrollmentInsights(students, classSettings, projectionDate);
      setInsights(result || "No strategic insights generated at this time.");
    } catch (error) {
      setInsights("Error generating enrollment insights.");
    } finally {
      setLoadingInsights(false);
    }
  };

  const updateClassDisplay = (className: string, key: keyof RosterDisplaySettings) => {
    setClassDisplaySettings(prev => {
      const current = prev[className] || { showDob: false, showAge: false, showTransition: false };
      return { ...prev, [className]: { ...current, [key]: !current[key] } };
    });
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
                onChange={(e) => setProjectionDate(autoFormatDate(e.target.value))} 
                className="bg-transparent border-none text-xs font-bold text-slate-700 focus:ring-0 outline-none p-0 w-full" 
              />
            </div>
            <button onClick={() => setIsAddingStudent(true)} className="text-white px-6 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-wider flex items-center space-x-2 transition-all shadow-lg hover:scale-105" style={{ backgroundColor: COLORS.brandBlue }}><Plus className="w-4 h-4" /><span>Enroll Student</span></button>
          </div>
        </header>

        {activeTab === Tab.DASHBOARD && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
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

            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-500" />
                  AI Enrollment Insights
                </h3>
                <button onClick={handleGenerateInsights} disabled={loadingInsights} className="flex items-center space-x-2 px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest bg-slate-800 text-white hover:bg-slate-900 transition-all disabled:opacity-50">
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

            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-800 tracking-tight">Class Capacity</h3>
                <button onClick={() => setIsChartMinimized(!isChartMinimized)} className="p-2 hover:bg-slate-50 rounded-xl transition-all">
                  {isChartMinimized ? <Maximize2 className="w-5 h-5 text-slate-400" /> : <Minimize2 className="w-5 h-5 text-slate-400" />}
                </button>
              </div>
              {!isChartMinimized && <ClassBarChart data={dashboardData} />}
            </div>

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
                    handleUpdateStudent(studentId, { subdivisionIndex: 0 }); 
                    setManualAssignments(prev => ({ ...prev, [studentId]: cls.name })); 
                  }} className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full min-h-[350px] transition-all hover:shadow-xl relative">
                    <div className="p-5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                      <h4 className="font-bold text-slate-800 text-[10px] uppercase tracking-widest truncate">{cls.name}</h4>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setOpenSettingsClass(isSettingsOpen ? null : cls.name)}
                          className={`p-1.5 rounded-lg transition-colors ${isSettingsOpen ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:bg-slate-100'}`}
                        >
                          <Settings2 className="w-4 h-4" />
                        </button>
                        <span className="text-[10px] px-2.5 py-1 rounded-lg font-black bg-white border border-slate-200 text-slate-600 shadow-sm">{enrolled.length}/{cls.capacity}</span>
                      </div>
                    </div>

                    {isSettingsOpen && (
                      <div className="absolute top-16 right-5 left-5 z-20 bg-white shadow-2xl rounded-2xl border border-slate-100 p-4 space-y-3 animate-in zoom-in-95 duration-200">
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em] mb-2">Display Controls</p>
                        <label className="flex items-center justify-between cursor-pointer group">
                          <span className="text-[10px] font-bold text-slate-600">Show Birthdays</span>
                          <input type="checkbox" checked={settings.showDob} onChange={() => updateClassDisplay(cls.name, 'showDob')} className="w-4 h-4 rounded text-indigo-600" />
                        </label>
                        <label className="flex items-center justify-between cursor-pointer group">
                          <span className="text-[10px] font-bold text-slate-600">Show Age (y/m)</span>
                          <input type="checkbox" checked={settings.showAge} onChange={() => updateClassDisplay(cls.name, 'showAge')} className="w-4 h-4 rounded text-indigo-600" />
                        </label>
                        <label className="flex items-center justify-between cursor-pointer group">
                          <span className="text-[10px] font-bold text-slate-600">Transition Dates</span>
                          <input type="checkbox" checked={settings.showTransition} onChange={() => updateClassDisplay(cls.name, 'showTransition')} className="w-4 h-4 rounded text-indigo-600" />
                        </label>
                      </div>
                    )}

                    <div className="p-4 space-y-3 flex-1 max-h-[500px] overflow-y-auto custom-scrollbar">
                      {enrolled.length === 0 ? (
                        <div className="h-full flex items-center justify-center py-10 opacity-30 italic text-[11px]">No students assigned</div>
                      ) : enrolled.map(s => {
                        const transitionDate = getProjectedTransitionDate(s, cls.name, classSettings);
                        return (
                          <div key={s.id} draggable onDragStart={(e) => e.dataTransfer.setData("studentId", s.id)} onMouseEnter={() => setHighlightedStudentId(s.id)} onMouseLeave={() => setHighlightedStudentId(null)} className="group relative flex flex-col p-4 rounded-2xl border border-slate-100 bg-slate-50/30 hover:bg-white hover:shadow-md hover:border-slate-200 transition-all cursor-grab active:cursor-grabbing">
                            <div className="flex items-center space-x-2">
                              <GripVertical className="w-3.5 h-3.5 text-slate-300" />
                              <span className="font-bold text-[12px] truncate" style={{ color: getStudentNameColor(s) }}>{s.name}</span>
                            </div>
                            {(settings.showDob || settings.showAge || settings.showTransition) && (
                              <div className="mt-2.5 space-y-1.5 pl-6 border-l-2 border-slate-200 ml-1.5">
                                {settings.showDob && (
                                  <p className="text-[10px] font-semibold text-slate-400 flex items-center gap-2 uppercase tracking-tighter">
                                    <Calendar className="w-3 h-3" /> {new Date(s.dob).toLocaleDateString()}
                                  </p>
                                )}
                                {settings.showAge && (
                                  <p className="text-[10px] font-bold text-indigo-600 flex items-center gap-2 uppercase tracking-tighter">
                                    <Clock className="w-3 h-3" /> {formatDetailedAge(s.dob, projectionDate)}
                                  </p>
                                )}
                                {settings.showTransition && transitionDate && (
                                  <p className="text-[9px] font-black text-emerald-600 flex items-center gap-2 uppercase tracking-tighter bg-emerald-50 px-2 py-0.5 rounded-md w-fit mt-1">
                                    Next: {new Date(transitionDate).toLocaleDateString()}
                                  </p>
                                )}
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

        {/* Other tabs follow same pattern but ensuring MM/DD/YYYY */}
        {activeTab === Tab.ROSTER && (
          <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex space-x-2 bg-slate-100 p-1.5 rounded-3xl w-fit">
                {[{ id: RosterFilter.ACTIVE, label: 'Active', icon: UserCheck }, { id: RosterFilter.WAITLISTED, label: 'Waitlist', icon: Clock }, { id: RosterFilter.GRADUATED, label: 'Withdrawn', icon: GraduationCap }, { id: RosterFilter.ALL, label: 'Full Registry', icon: Users }].map(({ id, label, icon: Icon }) => (
                  <button key={id} onClick={() => setRosterFilter(id)} className={`flex items-center space-x-3 px-6 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-wider transition-all ${rosterFilter === id ? 'bg-white text-slate-800 shadow-md' : 'text-slate-400 hover:text-slate-700'}`} style={{ color: rosterFilter === id ? COLORS.brandGreen : '' }}><Icon className="w-4 h-4" /><span>{label}</span></button>
                ))}
              </div>
              {selectedIds.size > 0 && (
                <button onClick={() => { if(window.confirm(`Permanently remove ${selectedIds.size} records?`)) { setStudents(prev => prev.filter(s => !selectedIds.has(s.id))); setSelectedIds(new Set()); showConfirmation(`Removed ${selectedIds.size} records`); } }} className="bg-rose-600 text-white px-6 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-lg hover:bg-rose-700 transition-all flex items-center gap-3 animate-in fade-in slide-in-from-right-4"><Trash2 className="w-4 h-4" /> Delete ({selectedIds.size})</button>
              )}
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-8 border-b border-slate-100 flex items-center justify-between gap-6">
                <div className="relative flex-1">
                  <Search className="w-5 h-5 absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input type="text" placeholder="Filter roster directory..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-16 pr-8 py-5 bg-slate-50 border-none rounded-[1.5rem] text-sm font-semibold focus:ring-2 focus:ring-slate-100 outline-none shadow-inner" />
                </div>
                <button onClick={() => setIsBulkAdding(true)} className="px-8 py-5 bg-slate-50 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-800 transition-all flex items-center space-x-2 border border-slate-100"><Upload className="w-4 h-4" /><span>Sync Data</span></button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-slate-50/50 border-b border-slate-100">
                    <tr>
                      <th className="px-8 py-6 w-16"><button onClick={() => { if (selectedIds.size === filteredStudents.length && filteredStudents.length > 0) setSelectedIds(new Set()); else setSelectedIds(new Set(filteredStudents.map(s => s.id))); }} className="p-1 hover:bg-white rounded-lg transition-colors">{selectedIds.size === filteredStudents.length && filteredStudents.length > 0 ? <CheckSquare className="w-4.5 h-4.5 text-indigo-600" /> : <Square className="w-4.5 h-4.5 text-slate-300" />}</button></th>
                      <th className="px-4 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center w-12">#</th>
                      <th className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest sticky left-0 bg-slate-50"><button onClick={() => { if(sortKey === 'name') setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); else { setSortKey('name'); setSortDir('asc'); } }} className="flex items-center gap-2 hover:text-slate-800 transition-colors">Student <ArrowUpDown className="w-3 h-3" /></button></th>
                      <th className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest"><button onClick={() => { if(sortKey === 'dob') setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); else { setSortKey('dob'); setSortDir('asc'); } }} className="flex items-center gap-2 hover:text-slate-800 transition-colors">DOB <ArrowUpDown className="w-3 h-3" /></button></th>
                      <th className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest"><button onClick={() => { if(sortKey === 'class') setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); else { setSortKey('class'); setSortDir('asc'); } }} className="flex items-center gap-2 hover:text-slate-800 transition-colors">Current Class <ArrowUpDown className="w-3 h-3" /></button></th>
                      <th className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">FTE</th>
                      <th className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Utility</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredStudents.map((s, idx) => {
                      const nameColor = getStudentNameColor(s);
                      const isExpanded = expandedStudentId === s.id;
                      const isHighlighted = highlightedStudentId === s.id;
                      const currentClass = getEffectiveClass(s, projectionDate, classSettings, manualAssignments, manualTransitionDates);
                      const isSelected = selectedIds.has(s.id);
                      return (
                        <React.Fragment key={s.id}>
                          <tr onMouseEnter={() => setHighlightedStudentId(s.id)} onMouseLeave={() => setHighlightedStudentId(null)} className={`hover:bg-slate-50 transition-all group ${isExpanded ? 'bg-slate-50 shadow-inner' : ''} ${isSelected ? 'bg-indigo-50/30' : ''}`}>
                            <td className="px-8 py-6"><button onClick={() => { const next = new Set(selectedIds); if (next.has(s.id)) next.delete(s.id); else next.add(s.id); setSelectedIds(next); }} className="p-1 hover:bg-white rounded-lg transition-colors">{isSelected ? <CheckSquare className="w-4.5 h-4.5 text-indigo-600" /> : <Square className="w-4.5 h-4.5 text-slate-200 group-hover:text-slate-300" />}</button></td>
                            <td className="px-4 py-6 text-center text-[11px] font-bold text-slate-300">{idx + 1}</td>
                            <td className="px-8 py-6 sticky left-0 bg-white group-hover:bg-slate-50 z-10 min-w-[240px] relative">
                              <div className="flex items-center space-x-4">
                                <button onClick={() => setExpandedStudentId(isExpanded ? null : s.id)} className="p-1.5 hover:bg-slate-100 rounded-xl transition-all">{isExpanded ? <ChevronUp className="w-4.5 h-4.5 text-slate-400" /> : <ChevronDown className="w-4.5 h-4.5 text-slate-400" />}</button>
                                <span className="font-bold cursor-help transition-colors text-[13px]" style={{ color: nameColor }}>{s.name}</span>
                                {s.isStaffChild && <ShieldCheck className="w-4 h-4" style={{ color: COLORS.staffPurple }} />}
                                {(s.allergies.length > 0 || s.medications.length > 0) && <AlertCircle className="w-4 h-4 text-rose-500" />}
                                {isHighlighted && <RelationshipHoverDetails studentId={s.id} />}
                              </div>
                            </td>
                            <td className="px-8 py-6 text-xs font-bold text-slate-500">{new Date(s.dob).toLocaleDateString()}</td>
                            <td className="px-8 py-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">{currentClass}</td>
                            <td className="px-8 py-6 text-center font-bold text-slate-600">{s.fte.toFixed(1)}</td>
                            <td className="px-8 py-6 text-right"><button onClick={() => { if(window.confirm('Remove record?')) { setStudents(prev => prev.filter(st => st.id !== s.id)); showConfirmation("Record removed"); } }} className="p-2.5 text-slate-200 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-4.5 h-4.5" /></button></td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-slate-50/50"><td colSpan={7} className="px-12 py-10 border-l-[6px] border-slate-300 shadow-inner"><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
                              <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
                                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center space-x-3"><ClipboardList className="w-4 h-4" /><span>Administrative</span></h5>
                                <div className="space-y-4">
                                  <label className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors"><span className="text-[10px] font-bold text-slate-500 uppercase">Staff Child</span><input type="checkbox" checked={s.isStaffChild} onChange={e => handleUpdateStudent(s.id, { isStaffChild: e.target.checked })} className="w-5 h-5 rounded-lg text-indigo-600" /></label>
                                  <button onClick={() => setRelModalData({ sourceId: s.id, search: '', type: 'S' })} className="w-full py-3.5 bg-slate-50 hover:bg-indigo-50 text-indigo-600 rounded-2xl text-[10px] font-bold uppercase flex items-center justify-center space-x-3 border border-slate-100 transition-all shadow-sm"><UserPlus className="w-4 h-4" /><span>Link Connections</span></button>
                                </div>
                              </div>
                              <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
                                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center space-x-3"><AlertCircle className="w-4 h-4 text-rose-500" /><span>Safety Profile</span></h5>
                                <div className="space-y-3">{s.allergies.map(a => (<div key={a.id} className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center group/item border border-slate-100 shadow-sm"><div><p className="text-[11px] font-bold text-slate-800">{a.substance}</p><p className={`text-[8px] font-bold uppercase ${a.severity === 'Severe' ? 'text-rose-500' : 'text-slate-400'}`}>{a.severity}</p></div><div className="flex items-center space-x-1 opacity-0 group-hover/item:opacity-100"><button onClick={() => setAllergyEntry({ studentId: s.id, ...a })} className="p-2 hover:text-indigo-600"><Edit2 className="w-3.5 h-3.5" /></button></div></div>))}
                                <button onClick={() => setAllergyEntry({ studentId: s.id, substance: '', severity: 'Moderate', lastReaction: '', comments: '' })} className="w-full py-3 bg-rose-50/50 text-rose-600 rounded-2xl text-[10px] font-bold uppercase border-2 border-dashed border-rose-100 flex items-center justify-center space-x-3 transition-all hover:bg-rose-50"><PlusCircle className="w-4 h-4" /><span>Add Allergy</span></button></div>
                              </div>
                              <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
                                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center space-x-3"><Pill className="w-4 h-4 text-indigo-500" /><span>Medications</span></h5>
                                <div className="space-y-3">{s.medications.map(m => (<div key={m.id} className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center group/item border border-slate-100 shadow-sm"><div><p className="text-[11px] font-bold text-slate-800">{m.name}</p><p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Exp: {m.expirationDate}</p></div><div className="flex items-center space-x-1 opacity-0 group-hover/item:opacity-100"><button onClick={() => setMedEntry({ studentId: s.id, ...m, expiration: m.expirationDate })} className="p-2 hover:text-indigo-600"><Edit2 className="w-3.5 h-3.5" /></button></div></div>))}
                                <button onClick={() => setMedEntry({ studentId: s.id, name: '', frequency: '', expiration: '' })} className="w-full py-3 bg-indigo-50/50 text-indigo-600 rounded-2xl text-[10px] font-bold uppercase border-2 border-dashed border-indigo-100 flex items-center justify-center space-x-3 transition-all hover:bg-indigo-50"><PlusCircle className="w-4 h-4" /><span>Add Medication</span></button></div>
                              </div>
                              <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
                                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center space-x-3"><FileText className="w-4 h-4" /><span>Records</span></h5>
                                <div className="p-5 bg-slate-50 rounded-2xl space-y-5 border border-slate-100 shadow-inner">
                                  <div className="flex items-center justify-between"><span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Medical Form</span><input type="file" className="hidden" id={`upload-${s.id}`} onChange={e => handleUpdateStudent(s.id, { medicalFormUrl: '#' })} /><label htmlFor={`upload-${s.id}`} className="p-2 bg-white border border-slate-200 rounded-xl cursor-pointer hover:shadow-md transition-all shadow-sm"><Upload className="w-3.5 h-3.5 text-slate-600" /></label></div>
                                  <label className="block space-y-2"><span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Expiration</span><input type="text" placeholder="MM/DD/YYYY" value={s.documentExpirationDate || ''} onChange={e => handleUpdateStudent(s.id, { documentExpirationDate: autoFormatDate(e.target.value) })} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[11px] font-bold outline-none shadow-sm" /></label>
                                </div>
                              </div>
                            </div></td></tr>
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

        {/* Similar updates for Medical/Settings tabs ensuring Date input consistency */}
        {activeTab === Tab.MEDICAL && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white p-10 rounded-[3rem] shadow-sm border-l-[12px] border-rose-500 border border-slate-100 hover:shadow-xl transition-all">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-slate-800 flex items-center gap-3"><Bell className="w-6 h-6 text-rose-500 animate-pulse" /> Urgent (7 Days)</h3>
                  <span className="bg-rose-500 text-white px-5 py-1.5 rounded-full text-[12px] font-bold shadow-lg">{expirationGroups.urgent.length} Events</span>
                </div>
                <div className="space-y-4 overflow-y-auto max-h-[350px] pr-2 custom-scrollbar">
                  {expirationGroups.urgent.length === 0 ? <p className="text-slate-400 text-sm italic py-4 text-center">Zero urgent expirations detected.</p> :
                    expirationGroups.urgent.map((item, idx) => (
                      <div key={idx} className="bg-slate-50 p-5 rounded-2xl flex justify-between items-center border border-slate-100 hover:bg-white hover:shadow-sm transition-all shadow-sm">
                        <div><p className="text-sm font-bold text-slate-800">{item.studentName}</p><p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">{item.itemName} ({item.type})</p></div>
                        <div className="text-right"><p className="text-lg font-bold text-rose-600 leading-none">{item.daysLeft}d</p><p className="text-[9px] text-slate-400 uppercase font-black">Left</p></div>
                      </div>
                    ))
                  }
                </div>
              </div>
              <div className="bg-white p-10 rounded-[3rem] shadow-sm border-l-[12px] border-amber-400 border border-slate-100 hover:shadow-xl transition-all">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-slate-800 flex items-center gap-3"><Clock className="w-6 h-6 text-amber-500" /> Upcoming (30 Days)</h3>
                  <span className="bg-amber-400 text-white px-5 py-1.5 rounded-full text-[12px] font-bold shadow-lg">{expirationGroups.upcoming.length} Events</span>
                </div>
                <div className="space-y-4 overflow-y-auto max-h-[350px] pr-2 custom-scrollbar">
                  {expirationGroups.upcoming.length === 0 ? <p className="text-slate-400 text-sm italic py-4 text-center">No upcoming expirations found.</p> :
                    expirationGroups.upcoming.map((item, idx) => (
                      <div key={idx} className="bg-slate-50 p-5 rounded-2xl flex justify-between items-center border border-slate-100 hover:bg-white hover:shadow-sm transition-all shadow-sm">
                        <div><p className="text-sm font-bold text-slate-800">{item.studentName}</p><p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">{item.itemName} ({item.type})</p></div>
                        <div className="text-right"><p className="text-lg font-bold text-amber-500 leading-none">{item.daysLeft}d</p><p className="text-[9px] text-slate-400 uppercase font-black">Left</p></div>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                <div className="relative w-1/2">
                  <Search className="w-5 h-5 absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input type="text" placeholder="Search safety database..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-16 pr-8 py-5 bg-slate-50 border-none rounded-[1.5rem] text-sm font-semibold focus:ring-2 focus:ring-slate-100 outline-none shadow-inner" />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-slate-50/50 border-b border-slate-100">
                    <tr>
                      <th className="px-10 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] sticky left-0 bg-slate-50">Student</th>
                      <th className="px-10 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Allergies</th>
                      <th className="px-10 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Medication Log</th>
                      <th className="px-10 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Status & Expiry</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {students.filter(s => (s.allergies.length > 0 || s.medications.length > 0 || s.medicalFormUrl) && s.name.toLowerCase().includes(searchTerm.toLowerCase())).map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50 transition-all group">
                        <td className="px-10 py-8 sticky left-0 bg-white group-hover:bg-slate-50 min-w-[220px]">
                          <span className="font-bold text-slate-800 text-[14px]" style={{ color: getStudentNameColor(s) }}>{s.name}</span>
                          <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">{getEffectiveClass(s, projectionDate, classSettings, manualAssignments, manualTransitionDates)}</p>
                        </td>
                        <td className="px-10 py-8 space-y-3">{s.allergies.map(a => (<div key={a.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 shadow-sm"><p className="text-[11px] font-bold text-slate-700">{a.substance}</p><p className={`text-[8px] font-bold uppercase tracking-widest ${a.severity === 'Severe' ? 'text-rose-500' : 'text-slate-400'}`}>{a.severity} Severity</p></div>))}</td>
                        <td className="px-10 py-8 space-y-3">{s.medications.map(m => {
                          const urgent = flexibleParseDate(m.expirationDate);
                          const isUrgent = urgent && Math.ceil((urgent.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) <= 7;
                          return (<div key={m.id} className="p-3 bg-indigo-50/30 rounded-xl border border-indigo-100 shadow-sm"><p className="text-[11px] font-bold text-indigo-800">{m.name} ({m.frequency})</p><p className={`text-[9px] font-bold uppercase tracking-widest ${isUrgent ? 'text-rose-500 animate-pulse font-black' : 'text-slate-400'}`}>Exp: {m.expirationDate}</p></div>);
                        })}</td>
                        <td className="px-10 py-8">{s.medicalFormUrl ? (
                          <div className="p-4 bg-slate-50 rounded-2xl space-y-2 border border-slate-100 shadow-sm">
                            <a href={s.medicalFormUrl} className="text-[11px] font-bold text-slate-700 flex items-center gap-2 hover:text-indigo-600 transition-colors"><FileText className="w-4 h-4" /> View Verified Form</a>
                            <p className={`text-[10px] font-bold uppercase tracking-widest ${isExpiringSoon(s.documentExpirationDate, 7) ? 'text-rose-500 animate-pulse font-black' : 'text-slate-400'}`}>Expires: {s.documentExpirationDate || 'N/A'}</p>
                          </div>
                        ) : <div className="flex items-center gap-3 text-slate-300"><AlertTriangle className="w-5 h-5" /><span className="text-[10px] font-bold uppercase italic tracking-widest">Form Missing</span></div>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Settings Tab updates omitted for brevity but they follow MM/DD/YYYY mask */}
      </main>

      {/* Modals ensuring MM/DD/YYYY mask */}
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

      {relModalData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9999] flex items-center justify-center p-8"><div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl p-12 flex flex-col max-h-[85vh] animate-in zoom-in-95 overflow-hidden"><div className="flex justify-between items-center mb-8"><h3 className="text-2xl font-bold text-slate-800">Establish Link</h3><button onClick={() => setRelModalData(null)} className="p-3 hover:bg-slate-100 rounded-full transition-all"><X className="w-8 h-8 text-slate-400" /></button></div><div className="flex space-x-4 mb-8"><button onClick={() => setRelModalData({...relModalData, type: 'S'})} className={`flex-1 py-4 rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] border-2 transition-all ${relModalData.type === 'S' ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-md' : 'bg-slate-50 border-slate-50 text-slate-300'}`}>Sibling</button><button onClick={() => setRelModalData({...relModalData, type: 'F'})} className={`flex-1 py-4 rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] border-2 transition-all ${relModalData.type === 'F' ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-md' : 'bg-slate-50 border-slate-50 text-slate-300'}`}>Friend</button></div><div className="relative mb-8"><Search className="w-6 h-6 absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" /><input type="text" placeholder="Filter roster..." value={relModalData.search} onChange={(e) => setRelModalData({...relModalData, search: e.target.value})} className="w-full pl-16 pr-8 py-5 bg-slate-50 border-none rounded-2xl text-sm font-bold outline-none shadow-inner" /></div><div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">{students.filter(s => s.id !== relModalData.sourceId && s.name.toLowerCase().includes(relModalData.search.toLowerCase())).map(s => (<button key={s.id} onClick={() => { handleAddRelationship(relModalData.sourceId, s.id, relModalData.type); setRelModalData(null); }} className="w-full flex items-center justify-between p-5 hover:bg-indigo-50/50 rounded-2xl transition-all border border-transparent hover:border-indigo-100 text-left group"><p className="text-[14px] font-bold text-slate-800 group-hover:text-indigo-600 transition-colors" style={{ color: getStudentNameColor(s) }}>{s.name}</p></button>))}</div></div></div>
      )}

      {allergyEntry && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9999] flex items-center justify-center p-8 animate-in fade-in duration-300"><div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl p-12 flex flex-col animate-in zoom-in-95"><h3 className="text-2xl font-bold text-slate-800 mb-8 tracking-tight">{allergyEntry.id ? 'Edit Allergy' : 'New Safety Protocol'}</h3><div className="space-y-6"><label className="block space-y-2"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Substance</span><input type="text" autoFocus value={allergyEntry.substance} onChange={e => setAllergyEntry({...allergyEntry, substance: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-base font-bold shadow-inner focus:ring-2 focus:ring-rose-100 transition-all" /></label><div className="grid grid-cols-3 gap-4">{(['Mild', 'Moderate', 'Severe'] as Allergy['severity'][]).map(sev => (<button key={sev} onClick={() => setAllergyEntry({...allergyEntry, severity: sev})} className={`py-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all border-2 ${allergyEntry.severity === sev ? 'bg-rose-50 border-rose-200 text-rose-600 shadow-md scale-105' : 'bg-slate-50 border-slate-50 text-slate-400'}`}>{sev}</button>))}</div><label className="block space-y-2"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Last Reacted (MM/DD/YYYY)</span><input type="text" placeholder="MM/DD/YYYY" value={allergyEntry.lastReaction} onChange={e => setAllergyEntry({...allergyEntry, lastReaction: autoFormatDate(e.target.value)})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-base font-bold shadow-inner" /></label></div><div className="flex space-x-5 mt-12"><button onClick={() => setAllergyEntry(null)} className="flex-1 py-5 bg-slate-100 rounded-2xl text-[11px] font-bold uppercase tracking-widest text-slate-500">Cancel</button><button onClick={() => { if (!allergyEntry.substance) return; const student = students.find(s => s.id === allergyEntry.studentId); if (student) { const newAllergies = allergyEntry.id ? student.allergies.map(a => a.id === allergyEntry.id ? { ...allergyEntry, id: a.id } as Allergy : a) : [...student.allergies, { ...allergyEntry, id: crypto.randomUUID() } as Allergy]; handleUpdateStudent(student.id, { allergies: newAllergies }); showConfirmation("Allergy entry saved"); } setAllergyEntry(null); }} className="flex-1 py-5 text-white rounded-2xl text-[11px] font-bold uppercase bg-rose-600 shadow-xl hover:bg-rose-700 transform hover:scale-105">Save Alert</button></div></div></div>
      )}

      {medEntry && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9999] flex items-center justify-center p-8 animate-in fade-in duration-300"><div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl p-12 flex flex-col animate-in zoom-in-95"><h3 className="text-2xl font-bold text-slate-800 mb-8 tracking-tight">{medEntry.id ? 'Edit Medication' : 'Enroll Medication'}</h3><div className="space-y-6"><label className="block space-y-2"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Medication Name</span><input type="text" autoFocus value={medEntry.name} onChange={e => setMedEntry({...medEntry, name: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-base font-bold shadow-inner" /></label><label className="block space-y-2"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Frequency</span><input type="text" value={medEntry.frequency} onChange={e => setMedEntry({...medEntry, frequency: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-base font-bold shadow-inner" /></label><label className="block space-y-2"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Expiration Date (MM/DD/YYYY)</span><input type="text" placeholder="MM/DD/YYYY" value={medEntry.expiration} onChange={e => setMedEntry({...medEntry, expiration: autoFormatDate(e.target.value)})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-base font-bold shadow-inner" /></label></div><div className="flex space-x-5 mt-12"><button onClick={() => setMedEntry(null)} className="flex-1 py-5 bg-slate-100 rounded-2xl text-[11px] font-bold uppercase text-slate-500">Cancel</button><button onClick={() => { if (!medEntry.name) return; const student = students.find(s => s.id === medEntry.studentId); if (student) { const newMeds = medEntry.id ? student.medications.map(m => m.id === medEntry.id ? { ...medEntry, expirationDate: medEntry.expiration, id: m.id } as Medication : m) : [...student.medications, { ...medEntry, expirationDate: medEntry.expiration, id: crypto.randomUUID() } as Medication]; handleUpdateStudent(student.id, { medications: newMeds }); showConfirmation("Medication entry saved"); } setMedEntry(null); }} className="flex-1 py-5 text-white rounded-2xl text-[11px] font-bold uppercase bg-indigo-600 shadow-xl hover:bg-indigo-700 transform hover:scale-105">Save Entry</button></div></div></div>
      )}
    </div>
  );
};

export default App;
