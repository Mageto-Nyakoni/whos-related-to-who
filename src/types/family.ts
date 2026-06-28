export type PersonRelationships = {
  parents: string[];
  children: string[];
  partners: string[];
};

export type Person = {
  id: string;
  name: string;
  nuclearFamilyId: string;
  dob?: string;
  phone: string;
  color?: string;
  relationships: PersonRelationships;
};

export type FamilyMetadata = {
  familyName: string;
  accessPasswords: Record<string, string>;
};

export type FamilyDataset = {
  metadata: FamilyMetadata;
  people: Person[];
};
