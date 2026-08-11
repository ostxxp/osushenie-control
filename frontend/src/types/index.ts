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
  object_type?: string | null
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
export type ObjectTaskStatus = 'todo' | 'in_progress' | 'pending_review' | 'rejected' | 'done' | 'skipped' | 'not_applicable'
export type TaskChildrenMode = 'all' | 'single_choice'

export type NotificationType =
  | 'user_assigned_to_object'
  | 'object_created'
  | 'task_status_changed'
  | 'user_created'

export interface NotificationLog {
  id: number
  receipt_id: number
  user_id: number
  actor_user_id: number
  actor_full_name: string | null
  object_id: number
  message: string
  type: NotificationType
  is_read: boolean
  read_at: string | null
  created_at: string
}

export interface ObjectTask {
  id: number
  object_id: number
  parent_id: number | null
  template_id?: number | null
  selected_child_id?: number | null
  title: string
  status: ObjectTaskStatus
  children_mode: TaskChildrenMode
  stage?: string | null
  depth: number
  sort_order: number
  is_active: boolean
  version: number
  deadline: string | null
  completed_at: string | null
  completed_by_id: number | null
  completed_by?: User
  assigned_to_id: number | null
  assigned_to?: User | null
  reviewer_id: number | null
  reviewer?: User | null
  submitted_at: string | null
  reviewed_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
}

export interface ObjectTaskUpsertPayload {
  parent_id?: number | null
  title: string
  sort_order?: number | null
  children_mode?: TaskChildrenMode
  status?: ObjectTaskStatus
  is_active?: boolean
  deadline?: string | null
  expected_version?: number
}

export interface ProjectStageSummary {
  code: string
  title: string
  order: number
  stats: { total: number; done: number; todo: number; in_progress: number; overdue: number }
}

export interface CurrentStep {
  task: ObjectTask | null
  stage: string | null
  stage_title: string | null
  stage_order: number | null
  action_required_by: User | null
  flag: 'normal' | 'due_soon' | 'overdue' | 'rejected'
  days_remaining: number | null
}

export interface TaskAttachment {
  id: number
  task_id: number
  uploaded_by_id: number | null
  original_filename: string
  mime_type: string
  size_bytes: number
  file_url: string
  created_at: string
}

export interface MyTask extends ObjectTask {
  object_name: string
  object_address: string
  action_required: string
  flag: CurrentStep['flag']
  days_remaining: number | null
}

export interface Page<T> { items: T[]; total: number; limit: number; offset: number }

export interface TaskActivity {
  id: number
  object_id: number | null
  object_name: string
  task_id: number | null
  task_title: string
  actor_user_id: number | null
  actor_full_name: string | null
  action: string
  from_status: ObjectTaskStatus | null
  to_status: ObjectTaskStatus | null
  details: Record<string, unknown>
  created_at: string
}

export interface ObjectTaskTree extends ObjectTask {
  children: ObjectTaskTree[]
}

export interface ObjectTaskListItem extends ObjectTask {
  main_task_id: number
  main_task_title: string
  path: string[]
}

export interface ObjectTaskListGroup {
  main_task_id: number
  main_task_title: string
  tasks: ObjectTaskListItem[]
}

export interface ObjectTaskStatusUpdateResponse extends ObjectTask {
  main_task_id: number
}

export interface ObjectPhotoSummary {
  id: number
  original_filename: string
  file_url: string
  created_at: string
}

export interface ObjectSummary extends ConstructionObject {
  stats: {
    total: number
    done: number
    todo: number
    in_progress: number
    overdue: number
  }
  progress: number
  photos: ObjectPhotoSummary[]
  responsible_users: User[]
  current_step: CurrentStep
}

export interface ObjectTaskStats {
  total: number
  done: number
  todo: number
  inProgress: number
  overdue: number
}

export interface AIChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AIChatResponse {
  answer: string
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
