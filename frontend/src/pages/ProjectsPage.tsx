import { useEffect, useState } from 'react'
import { projectApi, taskApi } from '@services/api'
import { formatDateRu } from '@/utils'
import type { Project, Task } from '@/types'

const projectButtonClasses = (isActive: boolean) =>
  isActive
    ? 'btn btn-block btn-primary btn-sm normal-case justify-start text-left'
    : 'btn btn-ghost btn-sm normal-case justify-start text-left'

const statusClasses: Record<string, string> = {
  planning: 'badge badge-warning',
  in_progress: 'badge badge-info',
  review: 'badge badge-secondary',
  todo: 'badge badge-neutral',
  completed: 'badge badge-success',
}

const priorityClasses: Record<string, string> = {
  low: 'badge badge-success',
  medium: 'badge badge-warning',
  high: 'badge badge-error',
  critical: 'badge badge-error',
}

function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const data = await projectApi.getAll()
        setProjects(data)
        if (data.length > 0) {
          setSelectedProject(data[0])
          await loadTasks(data[0].id)
        }
      } catch (err: any) {
        setError('Ошибка загрузки проектов')
        
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchProjects()
  }, [])

  const loadTasks = async (projectId: number) => {
    try {
      const data = await taskApi.getByProjectId(projectId)
      setTasks(data)
    } catch (err: any) {
      console.error('Error loading tasks:', err)
      setTasks([])
    }
  }

  const handleProjectSelect = async (project: Project) => {
    setSelectedProject(project)
    await loadTasks(project.id)
  }

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <span className="loading loading-spinner text-primary"></span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center px-4">
        <div className="alert alert-error shadow-lg max-w-xl w-full">
          <span>{error}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold">Проекты</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="card bg-base-100 shadow-lg overflow-hidden">
          <div className="card-body gap-4">
            <h2 className="card-title">Список проектов ({projects.length})</h2>
            {projects.length === 0 ? (
              <p className="text-base-content/70">Нет проектов</p>
            ) : (
              <div className="space-y-2">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className={projectButtonClasses(selectedProject?.id === project.id)}
                    onClick={() => handleProjectSelect(project)}
                  >
                    <div>
                      <div className="font-medium">{project.name}</div>
                      <div className="text-sm text-base-content/60 capitalize">{project.status.replace('_', ' ')}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card bg-base-100 shadow-lg">
          <div className="card-body space-y-4">
            {selectedProject ? (
              <>
                <div className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold">{selectedProject.name}</h2>
                      <p className="text-base-content/70">{selectedProject.description}</p>
                    </div>
                    <span className="badge badge-outline badge-lg">Проект #{selectedProject.id}</span>
                  </div>

                  <div className="divider" />

                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold">Задачи ({tasks.length})</h3>
                    {tasks.length === 0 ? (
                      <p className="text-base-content/70">Нет задач</p>
                    ) : (
                      <div className="space-y-4">
                        {tasks.map((task) => (
                          <div key={task.id} className="card bg-base-200 shadow-sm p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <div>
                                <h4 className="text-lg font-medium">{task.name}</h4>
                                <p className="text-base-content/70">{task.description}</p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`${statusClasses[task.status] ?? 'badge'}`}>{task.status.replace('_', ' ')}</span>
                                <span className={`${priorityClasses[task.priority] ?? 'badge'}`}>{task.priority}</span>
                              </div>
                            </div>
                            {task.due_date && (
                              <div className="mt-3 text-sm text-base-content/60">
                                Срок: {formatDateRu(task.due_date)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-base-content/70">Выберите проект</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProjectsPage
