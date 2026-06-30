import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { aiApi } from '@services/api'
import { formatApiError } from '@/utils'
import type { AIChatMessage } from '@/types'

const AI_CHAT_STORAGE_KEY = 'osushenie-ai-chat-messages'

const initialMessages: AIChatMessage[] = [
  {
    role: 'assistant',
    content: 'Я AI-ассистент администратора. Могу сделать сводку по объектам, найти риски и просроченные задачи.',
  },
]

const isAIChatMessage = (value: unknown): value is AIChatMessage => {
  if (typeof value !== 'object' || value === null || !('role' in value) || !('content' in value)) {
    return false
  }

  const message = value as Record<string, unknown>

  return (
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string'
  )
}

const loadStoredMessages = (): AIChatMessage[] => {
  const storedMessages = window.localStorage.getItem(AI_CHAT_STORAGE_KEY)
  if (!storedMessages) {
    return initialMessages
  }

  try {
    const parsedMessages: unknown = JSON.parse(storedMessages)
    if (!Array.isArray(parsedMessages) || !parsedMessages.every(isAIChatMessage)) {
      return initialMessages
    }

    return parsedMessages.length > 0 ? parsedMessages : initialMessages
  } catch {
    return initialMessages
  }
}

const renderInlineMarkdown = (text: string): ReactNode[] => {
  return text.split(/(\*\*.*?\*\*)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={`${part}-${index}`} className="font-bold text-slate-950">
          {part.slice(2, -2)}
        </strong>
      )
    }

    return part
  })
}

const isTableLine = (line: string): boolean => {
  return line.includes('|') && line.split('|').filter((cell) => cell.trim()).length >= 2
}

const isTableSeparatorLine = (line: string): boolean => {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
}

const parseTableRow = (line: string): string[] => {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

const renderMessageContent = (content: string): ReactNode[] => {
  const lines = content.split('\n')
  const elements: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmedLine = line.trim()

    if (!trimmedLine) {
      elements.push(<div key={`space-${index}`} className="h-3" />)
      index += 1
      continue
    }

    if (isTableLine(line)) {
      const tableLines: string[] = []

      while (index < lines.length && isTableLine(lines[index])) {
        if (!isTableSeparatorLine(lines[index])) {
          tableLines.push(lines[index])
        }
        index += 1
      }

      const [headLine, ...bodyLines] = tableLines
      const headCells = parseTableRow(headLine)

      elements.push(
        <div key={`table-${index}`} className="my-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                {headCells.map((cell, cellIndex) => (
                  <th key={`${cell}-${cellIndex}`} className="border-b border-slate-200 px-4 py-3 font-bold">
                    {renderInlineMarkdown(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyLines.map((bodyLine, rowIndex) => (
                <tr key={`${bodyLine}-${rowIndex}`} className="border-t border-slate-100">
                  {parseTableRow(bodyLine).map((cell, cellIndex) => (
                    <td key={`${cell}-${cellIndex}`} className="px-4 py-3 align-top text-slate-800">
                      {renderInlineMarkdown(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    if (trimmedLine.startsWith('### ')) {
      elements.push(
        <h3 key={`h3-${index}`} className="mt-4 text-xl font-bold text-slate-950 first:mt-0">
          {renderInlineMarkdown(trimmedLine.slice(4))}
        </h3>,
      )
      index += 1
      continue
    }

    if (trimmedLine.startsWith('## ')) {
      elements.push(
        <h2 key={`h2-${index}`} className="mt-5 text-2xl font-bold text-slate-950 first:mt-0">
          {renderInlineMarkdown(trimmedLine.slice(3))}
        </h2>,
      )
      index += 1
      continue
    }

    if (trimmedLine.startsWith('# ')) {
      elements.push(
        <h2 key={`h1-${index}`} className="mt-5 text-2xl font-bold text-slate-950 first:mt-0">
          {renderInlineMarkdown(trimmedLine.slice(2))}
        </h2>,
      )
      index += 1
      continue
    }

    if (trimmedLine.startsWith('- ')) {
      elements.push(
        <div key={`li-${index}`} className="my-2 flex gap-3">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff4539]" />
          <span>{renderInlineMarkdown(trimmedLine.slice(2))}</span>
        </div>,
      )
      index += 1
      continue
    }

    elements.push(
      <p key={`p-${index}`} className="my-2">
        {renderInlineMarkdown(trimmedLine)}
      </p>,
    )
    index += 1
  }

  return elements
}

function AiChatPage() {
  const [messages, setMessages] = useState<AIChatMessage[]>(loadStoredMessages)
  const [messageText, setMessageText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    window.localStorage.setItem(AI_CHAT_STORAGE_KEY, JSON.stringify(messages))
  }, [messages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading])

  const chatHistory = useMemo(
    () => messages.filter((message) => message.content.trim() !== ''),
    [messages],
  )

  const handleClearChat = () => {
    setMessages(initialMessages)
    setError('')
    window.localStorage.removeItem(AI_CHAT_STORAGE_KEY)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedMessage = messageText.trim()
    if (!trimmedMessage || loading) return

    const nextMessages: AIChatMessage[] = [
      ...messages,
      {
        role: 'user',
        content: trimmedMessage,
      },
    ]

    setMessages(nextMessages)
    setMessageText('')
    setError('')
    setLoading(true)

    try {
      const response = await aiApi.sendMessage(trimmedMessage, chatHistory)
      setMessages([
        ...nextMessages,
        {
          role: 'assistant',
          content: response.answer,
        },
      ])
    } catch (err) {
      const detail = (err as { response?: { data?: unknown } }).response?.data
      setError(formatApiError(detail, 'Не удалось получить ответ AI-ассистента.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-3rem)] max-w-5xl flex-col gap-6 overflow-hidden">
      <div className="shrink-0 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">AI-бот</h1>
          <p className="mt-2 max-w-3xl text-base text-slate-600">
            Чат для администратора: сводка по объектам, риски, просрочки и задачи, которые требуют внимания.
          </p>
        </div>
        <button
          type="button"
          onClick={handleClearChat}
          className="rounded-2xl border border-slate-300 px-5 py-3 text-base font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Очистить
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          {messages.map((message, index) => {
            const isUser = message.role === 'user'

            return (
              <div
                key={`${message.role}-${index}`}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={[
                    'max-w-[78%] whitespace-pre-wrap rounded-3xl px-5 py-4 text-base leading-relaxed',
                    isUser
                      ? 'bg-[#ff4539] text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-900',
                  ].join(' ')}
                >
                  {isUser ? message.content : renderMessageContent(message.content)}
                </div>
              </div>
            )
          })}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-base text-slate-500">
                Думаю над сводкой...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className="mx-6 mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="border-t border-slate-200 p-4">
          <div className="flex gap-3">
            <textarea
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              rows={2}
              placeholder="Например: дай краткую сводку по всем объектам и покажи риски"
              className="min-h-14 flex-1 resize-none rounded-2xl border border-slate-300 px-4 py-3 text-base outline-none transition focus:border-[#ff4539] focus:ring-2 focus:ring-[#ff4539]/20"
            />
            <button
              type="submit"
              disabled={loading || !messageText.trim()}
              className="rounded-2xl bg-[#ff4539] px-6 py-3 text-base font-semibold text-white transition hover:bg-[#e63d32] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Отправить
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AiChatPage
