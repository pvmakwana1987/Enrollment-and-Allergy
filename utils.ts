
import { Student, ClassConfig } from './types';
import { DEFAULT_ACADEMIC_CUTOFF_MONTH, DEFAULT_ACADEMIC_CUTOFF_DAY } from './constants';

export const parseDate = (dateStr: string) => {
  if (!dateStr) return null;
  // Standard format YYYY-MM-DD
  if (dateStr.includes('-')) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  // Standard format MM/DD/YYYY
  if (dateStr.includes('/')) {
    const [month, day, year] = dateStr.split('/').map(Number);
    const fullYear = year < 100 ? 2000 + year : year;
    return new Date(fullYear, month - 1, day);
  }
  return null;
};

export const dateDiffInMonths = (d1: Date, d2: Date) => {
  let months = (d2.getFullYear() - d1.getFullYear()) * 12;
  months -= d1.getMonth();
  months += d2.getMonth();
  return Math.max(0, months);
};

export const dateDiffInYears = (d1: Date, d2: Date) => {
  if (d1 > d2) return 0;
  let age = d2.getFullYear() - d1.getFullYear();
  const m = d2.getMonth() - d1.getMonth();
  if (m < 0 || (m === 0 && d2.getDate() < d1.getDate())) {
    age--;
  }
  return Math.max(0, age);
};

export const formatDetailedAge = (dob: string, targetDate: string): string => {
  const d1 = parseDate(dob);
  const d2 = parseDate(targetDate);
  if (!d1 || !d2) return "N/A";

  const totalMonths = dateDiffInMonths(d1, d2);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  
  if (years === 0) return `${months}m`;
  return `${years}y ${months}m`;
};

export const getProjectedTransitionDate = (student: Student, currentClassName: string, classes: ClassConfig[]): string | null => {
  const currentClass = classes.find(c => c.name === currentClassName);
  if (!currentClass || currentClass.isSpecial) return null;

  const dobDate = parseDate(student.dob);
  if (!dobDate) return null;

  if (currentClass.maxAge !== undefined) {
    const transDate = new Date(dobDate);
    transDate.setMonth(transDate.getMonth() + currentClass.maxAge);
    return transDate.toISOString().split('T')[0];
  }

  const today = new Date();
  const cutoffYear = (today.getMonth() + 1 > DEFAULT_ACADEMIC_CUTOFF_MONTH) || 
                     (today.getMonth() + 1 === DEFAULT_ACADEMIC_CUTOFF_MONTH && today.getDate() >= DEFAULT_ACADEMIC_CUTOFF_DAY)
                     ? today.getFullYear() + 1 
                     : today.getFullYear();

  const academicCutoff = new Date(cutoffYear, DEFAULT_ACADEMIC_CUTOFF_MONTH - 1, DEFAULT_ACADEMIC_CUTOFF_DAY);
  return academicCutoff.toISOString().split('T')[0];
};

export const getAgeAtAcademicCutoff = (dob: string, projectionDate: string) => {
  const dobDate = parseDate(dob);
  const projDate = parseDate(projectionDate);
  if (!dobDate || !projDate) return 0;

  const cutoffOfProjYear = new Date(projDate.getFullYear(), DEFAULT_ACADEMIC_CUTOFF_MONTH - 1, DEFAULT_ACADEMIC_CUTOFF_DAY);
  
  let targetCutoff = cutoffOfProjYear;
  if (projDate < cutoffOfProjYear) {
    targetCutoff = new Date(projDate.getFullYear() - 1, DEFAULT_ACADEMIC_CUTOFF_MONTH - 1, DEFAULT_ACADEMIC_CUTOFF_DAY);
  }

  return dateDiffInYears(dobDate, targetCutoff);
};

export const getAutomaticClass = (student: Student, projectionDate: string, classes: ClassConfig[]): string => {
  const dobDate = parseDate(student.dob);
  const projDate = parseDate(projectionDate);
  if (!dobDate || !projDate) return "Graduated/Withdrawn";

  const ageInMonths = dateDiffInMonths(dobDate, projDate);
  const ageAtCutoff = getAgeAtAcademicCutoff(student.dob, projectionDate);

  const activeClasses = classes.filter(c => !c.hidden && !c.isSpecial).sort((a, b) => a.order - b.order);

  if (ageAtCutoff >= 5) return "Graduated/Withdrawn";
  
  if (ageAtCutoff >= 4) {
    const preK = activeClasses.find(c => c.name.toLowerCase().includes("prek") || c.name.toLowerCase().includes("transitional"));
    if (preK) return preK.name;
  }
  
  if (ageAtCutoff >= 3) {
    const preschool = activeClasses.find(c => c.name.toLowerCase() === "preschool" || c.name.toLowerCase().includes("preschool (3y+)"));
    if (preschool) return preschool.name;
  }

  for (const cls of activeClasses) {
    if (cls.minAge !== undefined && cls.maxAge !== undefined) {
      if (ageInMonths >= cls.minAge && ageInMonths < cls.maxAge) {
        return cls.name;
      }
    }
  }

  if (ageInMonths >= 24) {
    const earlyPS = activeClasses.find(c => c.name.toLowerCase().includes("early preschool"));
    if (earlyPS) return earlyPS.name;
  }
  
  return activeClasses[0]?.name || "Graduated/Withdrawn";
};

export const getEffectiveClass = (
  student: Student, 
  projectionDate: string, 
  classes: ClassConfig[],
  manualAssignments: Record<string, string>,
  manualTransitionDates: Record<string, string>
): string => {
  const projDate = parseDate(projectionDate);
  if (!projDate) return "Graduated/Withdrawn";

  if (student.withdrawalDate) {
    const wDate = parseDate(student.withdrawalDate);
    if (wDate && wDate <= projDate) return "Graduated/Withdrawn";
  }

  if (manualAssignments[student.id]) {
    const assigned = classes.find(c => c.name === manualAssignments[student.id]);
    if (assigned && !assigned.hidden) return assigned.name;
  }

  const manualDateStr = manualTransitionDates[student.id];
  if (manualDateStr) {
    const mDate = parseDate(manualDateStr);
    if (mDate && projDate >= mDate) {
      const auto = getAutomaticClass(student, manualDateStr, classes);
      const sorted = [...classes].filter(c => !c.isSpecial && !c.hidden).sort((a,b) => a.order - b.order);
      const idx = sorted.findIndex(c => c.name === auto);
      if (idx !== -1 && idx < sorted.length - 1) return sorted[idx + 1].name;
      return "Graduated/Withdrawn";
    }
  }

  return getAutomaticClass(student, projectionDate, classes);
};
