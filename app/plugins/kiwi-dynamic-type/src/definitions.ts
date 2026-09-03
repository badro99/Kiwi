export interface DynamicTypeResult {
  scale: number;
  category: string;
}

export interface KiwiDynamicTypePlugin {
  getDynamicTypeScale(): Promise<DynamicTypeResult>;
}
