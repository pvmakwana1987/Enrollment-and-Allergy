
export interface Medication {
  id: string;
  name: string;
  frequency: string;
  expirationDate: string;
}

export interface Allergy {
  id: string;
  substance: string;
  severity: 'Mild' | 'Moderate' | 'Severe';
  lastReaction: string;
  comments: string;
}

export interface ClassConfig {
  name: string;
  capacity: number;
  hidden: boolean;
  order: number;
  minAge?: number;
  maxAge?: number;
  subdivisionCount?: number;
  isSpecial?: boolean;
}

export interface StudentRelationship {
  targetId: string;
  type: 'S' | 'F'; // Sibling or Friend
}

export interface Student {
  id: string;
  name: string;
  dob: string;
  fte: number;
  isStaffChild: boolean;
  isPromo: boolean;
  promoComment?: string;
  comments?: string;
  relationships: StudentRelationship[];
  subdivisionIndex?: number;
  withdrawalDate?: string;
  // Medical Tracker Fields
  allergies: Allergy[];
  medications: Medication[];
  emergencyContact: string;
  // Documentation
  medicalFormUrl?: string;
  documentExpirationDate?: string;
  // Alerting & Contact
  parentEmail?: string;
  leadershipEmail?: string;
  alertLeadDays?: number[]; // e.g., [30, 7]
}

export enum Tab {
  DASHBOARD = 'dashboard',
  ROSTER = 'roster',
  MEDICAL = 'medical',
  SETTINGS = 'settings'
}
