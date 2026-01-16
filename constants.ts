
import { ClassConfig } from './types';

export const DEFAULT_ACADEMIC_CUTOFF_MONTH = 8; // August
export const DEFAULT_ACADEMIC_CUTOFF_DAY = 31;

export const DEFAULT_CLASSES: ClassConfig[] = [
  { name: "Young Infant", capacity: 8, hidden: false, order: 0, minAge: 0, maxAge: 8, subdivisionCount: 1 },
  { name: "Older Infant", capacity: 8, hidden: false, order: 1, minAge: 8, maxAge: 12, subdivisionCount: 1 },
  { name: "Younger Toddler", capacity: 18, hidden: false, order: 2, minAge: 12, maxAge: 18, subdivisionCount: 1 },
  { name: "Older Toddler", capacity: 18, hidden: false, order: 3, minAge: 18, maxAge: 24, subdivisionCount: 1 },
  { name: "Early Preschool", capacity: 48, hidden: false, order: 4, subdivisionCount: 1, minAge: 24, maxAge: 36 },
  { name: "Preschool Pathways", capacity: 16, hidden: false, order: 5, subdivisionCount: 1 },
  { name: "Preschool", capacity: 48, hidden: false, order: 6, subdivisionCount: 1 },
  { name: "PreK", capacity: 48, hidden: false, order: 7, subdivisionCount: 1 },
  { name: "Transitional Kindergarten", capacity: 0, hidden: false, order: 8, subdivisionCount: 1 },
  { name: "Afterschool", capacity: 10, hidden: false, order: 9, subdivisionCount: 1 },
  { name: "Graduated/Withdrawn", capacity: 0, hidden: false, order: 10, isSpecial: true },
];

export const COLORS = {
  brandGreen: '#5e6738',
  brandRed: '#e03c31',
  brandBlue: '#006ba6',
  brandOrange: '#ff9e1b',
  staffPurple: '#814c9e',
  linkTurquoise: '#00a5b5',
  background: '#f8fafc',
};
