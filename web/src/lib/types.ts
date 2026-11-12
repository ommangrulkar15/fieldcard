export type FieldType = 'text' | 'longtext' | 'number' | 'date' | 'dropdown' | 'choice' | 'yesno' | 'photo'

export interface Option {
  value: string
  archived: boolean
}

export interface Field {
  id: string
  key: string
  label: string
  table_label: string | null
  type: FieldType
  options: Option[]
  config: { allow_custom?: boolean }
  group_id: string | null
  group_name: string | null
  group_position: number | null
  position: number
  table_position: number | null
  required: boolean
  on_card: boolean
  on_form: boolean
  is_core: boolean
  is_hidden: boolean
}

export type Value = string | boolean

export interface Job {
  id: string
  values: Record<string, Value>
  created_at: string
  updated_at: string
}

export interface JobPage {
  items: Job[]
  total: number
  page: number
  page_size: number
}

export interface Membership {
  id: string
  name: string
  template: string
  role: 'admin' | 'supervisor' | 'crew'
  permissions: string[]
}

export interface Me {
  user: { id: string; email: string; name: string }
  workspaces: Membership[]
}

export interface Member {
  user_id: string
  email: string
  name: string
  role: 'admin' | 'supervisor' | 'crew'
  is_active: boolean
}

export interface Photo {
  id: string
  width: number
  height: number
  size_bytes: number
  created_at: string
}
