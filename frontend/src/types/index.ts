// Users
export interface User {
  id: number
  email: string
  full_name: string
  phone_number?: string | null
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
}

export type UserRole = 'admin' | 'chief_engineer' | 'foreman'

// Projects
export interface Project {
  id: number
  name: string
  description: string
  status: ProjectStatus
  start_date: string
  end_date?: string
  manager_id: number
  manager?: User
  created_at: string
  updated_at: string
}

export interface ConstructionObject {
  id: number
  name: string
  description?: string
  address: string
  is_active: boolean
  start_date: string
  end_date?: string
  created_at: string
  updated_at: string
}

export type ProjectStatus = 'planning' | 'in_progress' | 'completed' | 'on_hold'

// Tasks
export interface Task {
  id: number
  project_id: number
  name: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  assigned_to_id?: number
  assigned_to?: User
  due_date?: string
  completed_date?: string
  order: number
  created_at: string
  updated_at: string
}

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'completed'
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical'

// Object Tasks
export type ObjectTaskStatus = 'todo' | 'in_progress' | 'done' | 'skipped' | 'not_applicable'
export type TaskChildrenMode = 'all' | 'single_choice'

export interface ObjectTask {
  id: number
  object_id: number
  parent_id: number | null
  template_id?: number | null
  title: string
  status: ObjectTaskStatus
  children_mode: TaskChildrenMode
  depth: number
  sort_order: number
  is_active: boolean
  completed_at: string | null
  completed_by_id: number | null
  completed_by?: User
  created_at: string
  updated_at: string
}

export interface ObjectTaskTree extends ObjectTask {
  children: ObjectTaskTree[]
}

export interface ObjectTaskStatusUpdateResponse extends ObjectTask {
  main_task_id: number
}

// Auth
export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
}
