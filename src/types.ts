export type ColumnId = 'Now' | 'Soon' | 'Later';

export interface Task {
  id: string;
  title: string;
  status: ColumnId;
  createdAt: number;
}
